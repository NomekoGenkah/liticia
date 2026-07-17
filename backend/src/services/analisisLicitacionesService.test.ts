import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../config/env", () => ({ config: { OLLAMA_MODEL: "qwen3:8b" } }));

import { AnalisisLicitacionesService } from "./analisisLicitacionesService";
import { NotFoundError, ProcesoCanceladoError } from "../utils/errors";
import type { LicitacionPendiente } from "../repositories/analisisLicitacionRepository";

const licitacionBase = {
  id: "lic-1",
  codigoExterno: "123-45-LE24",
  nombre: "Compra de insumos",
  descripcion: "Descripción de prueba",
  nombreOrganismo: "Organismo X",
  montoEstimado: 1000000,
  moneda: "CLP",
  tipo: "L1",
  fechaPublicacion: new Date("2026-07-01"),
  fechaCierre: new Date("2026-07-20"),
  items: [],
} satisfies LicitacionPendiente;

const resultadoLlm = {
  resumenEjecutivo: "Resumen",
  puntosClave: ["punto 1"],
  palabrasClave: ["clave 1"],
  nivelComplejidad: "media" as const,
};

const opcionesItem = () => ({ signal: new AbortController().signal, onToken: vi.fn(), onReintento: vi.fn() });

function buildService() {
  const ollamaClient = { generarAnalisis: vi.fn() };
  const analisisRepo = {
    guardarCompletado: vi.fn().mockResolvedValue({ id: "an-1", duracionMs: 10 }),
    guardarFallido: vi.fn().mockResolvedValue({ id: "an-1" }),
    listarPendientesActivas: vi.fn(),
    listarPorIds: vi.fn(),
  };
  const perfilEmpresaRepo = { obtener: vi.fn().mockResolvedValue(null) };

  const service = new AnalisisLicitacionesService(
    ollamaClient as never,
    analisisRepo as never,
    perfilEmpresaRepo as never
  );

  return { service, ollamaClient, analisisRepo, perfilEmpresaRepo };
}

describe("AnalisisLicitacionesService.procesar", () => {
  it("guarda el análisis completado en éxito", async () => {
    const { service, ollamaClient, analisisRepo } = buildService();
    ollamaClient.generarAnalisis.mockResolvedValueOnce(resultadoLlm);

    const resultado = await service.procesar(licitacionBase, opcionesItem());

    expect(analisisRepo.guardarCompletado).toHaveBeenCalledWith(
      expect.objectContaining({
        licitacionId: "lic-1",
        resumenEjecutivo: "Resumen",
        nivelComplejidad: "MEDIA",
        modelo: "qwen3:8b",
      })
    );
    expect(analisisRepo.guardarFallido).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: "an-1", duracionMs: 10 });
  });

  it("guarda el análisis fallido y relanza el error si Ollama falla", async () => {
    const { service, ollamaClient, analisisRepo } = buildService();
    ollamaClient.generarAnalisis.mockRejectedValueOnce(new Error("ollama caído"));

    await expect(service.procesar(licitacionBase, opcionesItem())).rejects.toThrow("ollama caído");

    expect(analisisRepo.guardarFallido).toHaveBeenCalledWith(
      expect.objectContaining({ licitacionId: "lic-1", detalleError: "ollama caído" })
    );
    expect(analisisRepo.guardarCompletado).not.toHaveBeenCalled();
  });

  it("NO persiste nada si el usuario canceló: la licitación vuelve a pendientes", async () => {
    // Si esto se rompe, cancelar marca la licitación FALLIDA con un intento gastado y la saca de
    // la cola de pendientes para siempre — un fallo silencioso y carísimo de diagnosticar.
    const { service, ollamaClient, analisisRepo } = buildService();
    ollamaClient.generarAnalisis.mockRejectedValueOnce(new ProcesoCanceladoError());

    await expect(service.procesar(licitacionBase, opcionesItem())).rejects.toBeInstanceOf(ProcesoCanceladoError);

    expect(analisisRepo.guardarFallido).not.toHaveBeenCalled();
    expect(analisisRepo.guardarCompletado).not.toHaveBeenCalled();
  });

  it("le pasa el signal y el onToken al cliente para poder cancelar y ver el progreso", async () => {
    const { service, ollamaClient } = buildService();
    ollamaClient.generarAnalisis.mockResolvedValueOnce(resultadoLlm);
    const opts = opcionesItem();

    await service.procesar(licitacionBase, opts);

    expect(ollamaClient.generarAnalisis).toHaveBeenCalledWith(expect.anything(), opts);
  });
});

describe("AnalisisLicitacionesService.planificar", () => {
  describe("modo PENDIENTES", () => {
    it("acota el batch a los segmentos UNSPSC del perfil", async () => {
      const { service, analisisRepo, perfilEmpresaRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValue({ categoriasUnspsc: ["43232400", "81111500", "43231500"] });
      analisisRepo.listarPendientesActivas.mockResolvedValueOnce([]);

      const plan = await service.planificar({ modo: "PENDIENTES" });

      expect(analisisRepo.listarPendientesActivas).toHaveBeenCalledWith(["43", "81"]);
      expect(plan.parametros).toEqual({ modo: "PENDIENTES", segmentos: ["43", "81"] });
    });

    it("procesa todo si no hay perfil configurado", async () => {
      // El filtro nunca puede dejar al batch sin hacer nada por falta de perfil.
      const { service, analisisRepo, perfilEmpresaRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValue(null);
      analisisRepo.listarPendientesActivas.mockResolvedValueOnce([]);

      await service.planificar({ modo: "PENDIENTES" });

      expect(analisisRepo.listarPendientesActivas).toHaveBeenCalledWith([]);
    });

    it("procesa todo si el perfil no declaró categorías", async () => {
      const { service, analisisRepo, perfilEmpresaRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValue({ categoriasUnspsc: [] });
      analisisRepo.listarPendientesActivas.mockResolvedValueOnce([]);

      await service.planificar({ modo: "PENDIENTES" });

      expect(analisisRepo.listarPendientesActivas).toHaveBeenCalledWith([]);
    });
  });

  describe("modo IDS", () => {
    it("NO aplica el prefiltro UNSPSC: las eligió el usuario", async () => {
      // El prefiltro decide a qué gastarle LLM cuando elige el sistema. Si lo aplicara acá,
      // "analizar 5 seleccionadas" analizaría 2 sin explicar por qué.
      const { service, analisisRepo, perfilEmpresaRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValue({ categoriasUnspsc: ["43232400"] });
      analisisRepo.listarPorIds.mockResolvedValueOnce([licitacionBase]);

      const plan = await service.planificar({ modo: "IDS", ids: ["lic-1"] });

      expect(analisisRepo.listarPorIds).toHaveBeenCalledWith(["lic-1"]);
      expect(analisisRepo.listarPendientesActivas).not.toHaveBeenCalled();
      expect(plan.items).toEqual([licitacionBase]);
      expect(plan.parametros).toEqual({ modo: "IDS", ids: ["lic-1"] });
    });

    it("lanza NotFoundError si alguno de los ids no existe", async () => {
      const { service, analisisRepo } = buildService();
      analisisRepo.listarPorIds.mockResolvedValueOnce([licitacionBase]);

      await expect(service.planificar({ modo: "IDS", ids: ["lic-1", "no-existe"] })).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});
