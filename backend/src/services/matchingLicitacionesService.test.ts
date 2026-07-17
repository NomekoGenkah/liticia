import { describe, it, expect, vi } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../config/env", () => ({ config: { OLLAMA_MODEL: "qwen3:8b" } }));

import { MatchingLicitacionesService, type ContextoMatching } from "./matchingLicitacionesService";
import { NotFoundError, ProcesoCanceladoError, UnprocessableEntityError } from "../utils/errors";
import type { LicitacionParaMatchingPendiente } from "../repositories/matchingLicitacionRepository";

const perfilBase = {
  id: "perfil-1",
  tipo: "EMPRESA" as const,
  nombre: "Servicios Climáticos SpA",
  descripcion: "Empresa de mantención de climatización.",
  rubro: "Climatización",
  palabrasClave: ["climatización"],
  categoriasUnspsc: ["72101507"],
  regionesInteres: ["Metropolitana"],
  montoMinimo: 5000000,
  montoMaximo: 50000000,
  version: 1,
};

const licitacionConAnalisisCompletado = {
  id: "lic-1",
  codigoExterno: "123-45-LE24",
  nombre: "Mantención de climatización",
  nombreOrganismo: "Organismo X",
  montoEstimado: 15000000,
  moneda: "CLP",
  regionUnidad: "Metropolitana",
  tipo: "L1",
  fechaCierre: new Date("2026-07-20"),
  analisis: {
    estado: "COMPLETADO" as const,
    resumenEjecutivo: "Resumen",
    puntosClave: ["punto 1"],
    palabrasClave: ["clave 1"],
    nivelComplejidad: "MEDIA" as const,
  },
};

const resultadoLlm = {
  puntaje: 85,
  recomendacion: "si" as const,
  justificacion: "Calza con el rubro declarado.",
};

const ctxBase: ContextoMatching = {
  perfil: { ...perfilBase, montoMinimo: 5000000, montoMaximo: 50000000 },
  perfilVersion: 1,
};

const opcionesItem = () => ({ signal: new AbortController().signal, onToken: vi.fn(), onReintento: vi.fn() });

function buildService() {
  const ollamaClient = { generarMatching: vi.fn() };
  const perfilEmpresaRepo = { obtener: vi.fn() };
  const matchingRepo = {
    guardarCompletado: vi.fn().mockResolvedValue({ id: "match-1", duracionMs: 10 }),
    guardarFallido: vi.fn().mockResolvedValue({ id: "match-1" }),
    listarPendientesActivas: vi.fn(),
    listarPorIds: vi.fn(),
  };

  const service = new MatchingLicitacionesService(
    ollamaClient as never,
    perfilEmpresaRepo as never,
    matchingRepo as never
  );

  return { service, ollamaClient, perfilEmpresaRepo, matchingRepo };
}

describe("MatchingLicitacionesService.procesar", () => {
  it("guarda el matching completado en éxito", async () => {
    const { service, ollamaClient, matchingRepo } = buildService();
    ollamaClient.generarMatching.mockResolvedValueOnce(resultadoLlm);

    const resultado = await service.procesar(licitacionConAnalisisCompletado, ctxBase, opcionesItem());

    expect(matchingRepo.guardarCompletado).toHaveBeenCalledWith(
      expect.objectContaining({
        licitacionId: "lic-1",
        puntaje: 85,
        recomendacion: "SI",
        justificacion: resultadoLlm.justificacion,
        modelo: "qwen3:8b",
        perfilVersion: 1,
      })
    );
    expect(matchingRepo.guardarFallido).not.toHaveBeenCalled();
    expect(resultado).toEqual({ id: "match-1", duracionMs: 10 });
  });

  it("guarda el matching fallido y relanza el error si Ollama falla", async () => {
    const { service, ollamaClient, matchingRepo } = buildService();
    ollamaClient.generarMatching.mockRejectedValueOnce(new Error("ollama caído"));

    await expect(service.procesar(licitacionConAnalisisCompletado, ctxBase, opcionesItem())).rejects.toThrow(
      "ollama caído"
    );

    expect(matchingRepo.guardarFallido).toHaveBeenCalledWith(
      expect.objectContaining({ licitacionId: "lic-1", detalleError: "ollama caído", perfilVersion: 1 })
    );
    expect(matchingRepo.guardarCompletado).not.toHaveBeenCalled();
  });

  it("NO persiste nada si el usuario canceló: la licitación vuelve a pendientes", async () => {
    const { service, ollamaClient, matchingRepo } = buildService();
    ollamaClient.generarMatching.mockRejectedValueOnce(new ProcesoCanceladoError());

    await expect(
      service.procesar(licitacionConAnalisisCompletado, ctxBase, opcionesItem())
    ).rejects.toBeInstanceOf(ProcesoCanceladoError);

    expect(matchingRepo.guardarFallido).not.toHaveBeenCalled();
    expect(matchingRepo.guardarCompletado).not.toHaveBeenCalled();
  });
});

describe("MatchingLicitacionesService.planificar", () => {
  it("lanza UnprocessableEntityError si no hay perfil configurado", async () => {
    // Antes esto se lanzaba dentro del batch ya disparado, así que moría en un log y el usuario
    // veía "matching iniciado" y nada más. Ahora planificar() corre antes del 202.
    const { service, perfilEmpresaRepo } = buildService();
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(null);

    await expect(service.planificar({ modo: "PENDIENTES" })).rejects.toBeInstanceOf(UnprocessableEntityError);
  });

  describe("modo PENDIENTES", () => {
    it("acota el batch a la versión del perfil y a sus segmentos UNSPSC", async () => {
      const { service, perfilEmpresaRepo, matchingRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
      matchingRepo.listarPendientesActivas.mockResolvedValueOnce([]);

      const plan = await service.planificar({ modo: "PENDIENTES" });

      expect(matchingRepo.listarPendientesActivas).toHaveBeenCalledWith(1, ["72"]);
      expect(plan.ctx.perfilVersion).toBe(1);
    });

    it("procesa todo si el perfil no declaró categorías", async () => {
      const { service, perfilEmpresaRepo, matchingRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValueOnce({ ...perfilBase, categoriasUnspsc: [] });
      matchingRepo.listarPendientesActivas.mockResolvedValueOnce([]);

      await service.planificar({ modo: "PENDIENTES" });

      expect(matchingRepo.listarPendientesActivas).toHaveBeenCalledWith(1, []);
    });
  });

  describe("modo IDS", () => {
    it("NO aplica el prefiltro UNSPSC: las eligió el usuario", async () => {
      const { service, perfilEmpresaRepo, matchingRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
      matchingRepo.listarPorIds.mockResolvedValueOnce({ listas: [licitacionConAnalisisCompletado], sinAnalisis: [] });

      const plan = await service.planificar({ modo: "IDS", ids: ["lic-1"] });

      expect(matchingRepo.listarPorIds).toHaveBeenCalledWith(["lic-1"]);
      expect(matchingRepo.listarPendientesActivas).not.toHaveBeenCalled();
      expect(plan.items).toHaveLength(1);
    });

    it("omite las que no tienen análisis pero procesa el resto", async () => {
      // Una selección de 2 con 1 sin análisis procesa 1 y reporta la otra: que una desaparezca en
      // silencio, o que el pedido entero falle por una, son las dos formas de hacerlo mal.
      const { service, perfilEmpresaRepo, matchingRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
      matchingRepo.listarPorIds.mockResolvedValueOnce({
        listas: [licitacionConAnalisisCompletado],
        sinAnalisis: [{ id: "lic-2", codigoExterno: "cod-2", nombre: "Otra", nombreOrganismo: "Org Y" }],
      });

      const plan = await service.planificar({ modo: "IDS", ids: ["lic-1", "lic-2"] });

      expect(plan.items).toHaveLength(1);
      expect(plan.omitidos).toEqual([
        expect.objectContaining({ objetoId: "lic-2", etiqueta: "cod-2", codigo: "ANALISIS_REQUERIDO" }),
      ]);
    });

    it("deja el plan vacío con el motivo si NINGUNA tiene análisis (el runner lo vuelve un 422)", async () => {
      const { service, perfilEmpresaRepo, matchingRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
      matchingRepo.listarPorIds.mockResolvedValueOnce({
        listas: [],
        sinAnalisis: [{ id: "lic-2", codigoExterno: "cod-2", nombre: "Otra", nombreOrganismo: null }],
      });

      const plan = await service.planificar({ modo: "IDS", ids: ["lic-2"] });

      expect(plan.items).toHaveLength(0);
      expect(plan.omitidos[0]?.codigo).toBe("ANALISIS_REQUERIDO");
    });

    it("lanza NotFoundError si alguno de los ids no existe", async () => {
      const { service, perfilEmpresaRepo, matchingRepo } = buildService();
      perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
      matchingRepo.listarPorIds.mockResolvedValueOnce({ listas: [licitacionConAnalisisCompletado], sinAnalisis: [] });

      await expect(service.planificar({ modo: "IDS", ids: ["lic-1", "no-existe"] })).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});
