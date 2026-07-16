import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../config/env", () => ({ config: { OLLAMA_MODEL: "qwen3:8b" } }));

import { AnalisisLicitacionesService } from "./analisisLicitacionesService";
import { NotFoundError } from "../utils/errors";
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

function buildService() {
  const ollamaClient = { generarAnalisis: vi.fn() };
  const licitacionRepo = { findByCodigoExterno: vi.fn() };
  const analisisRepo = {
    guardarCompletado: vi.fn().mockResolvedValue({ id: "an-1", duracionMs: 10 }),
    guardarFallido: vi.fn().mockResolvedValue({ id: "an-1" }),
    listarPendientesActivas: vi.fn(),
  };

  const service = new AnalisisLicitacionesService(
    ollamaClient as never,
    licitacionRepo as never,
    analisisRepo as never
  );

  return { service, ollamaClient, licitacionRepo, analisisRepo };
}

describe("AnalisisLicitacionesService.analizarUna", () => {
  it("lanza NotFoundError si la licitación no existe", async () => {
    const { service, licitacionRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce(null);

    await expect(service.analizarUna("no-existe")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("guarda el análisis completado en éxito", async () => {
    const { service, ollamaClient, licitacionRepo, analisisRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce({ ...licitacionBase, montoEstimado: 1000000 });
    ollamaClient.generarAnalisis.mockResolvedValueOnce(resultadoLlm);

    const resultado = await service.analizarUna("123-45-LE24");

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
    const { service, ollamaClient, licitacionRepo, analisisRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce(licitacionBase);
    ollamaClient.generarAnalisis.mockRejectedValueOnce(new Error("ollama caído"));

    await expect(service.analizarUna("123-45-LE24")).rejects.toThrow("ollama caído");

    expect(analisisRepo.guardarFallido).toHaveBeenCalledWith(
      expect.objectContaining({ licitacionId: "lic-1", detalleError: "ollama caído" })
    );
    expect(analisisRepo.guardarCompletado).not.toHaveBeenCalled();
  });
});

describe("AnalisisLicitacionesService.analizarPendientes", () => {
  it("continúa tras un error por ítem y agrega los contadores correctamente", async () => {
    const { service, ollamaClient, analisisRepo } = buildService();
    const pendientes: LicitacionPendiente[] = [
      { ...licitacionBase, id: "lic-1", codigoExterno: "cod-1" },
      { ...licitacionBase, id: "lic-2", codigoExterno: "cod-2" },
      { ...licitacionBase, id: "lic-3", codigoExterno: "cod-3" },
    ];
    analisisRepo.listarPendientesActivas.mockResolvedValueOnce(pendientes);

    ollamaClient.generarAnalisis
      .mockResolvedValueOnce(resultadoLlm)
      .mockRejectedValueOnce(new Error("falla puntual"))
      .mockResolvedValueOnce(resultadoLlm);

    const resumen = await service.analizarPendientes();

    expect(resumen).toEqual({ totalEncontradas: 3, totalCompletadas: 2, totalFallidas: 1 });
    expect(analisisRepo.guardarCompletado).toHaveBeenCalledTimes(2);
    expect(analisisRepo.guardarFallido).toHaveBeenCalledTimes(1);
  });

  it("devuelve contadores en cero si no hay pendientes", async () => {
    const { service, analisisRepo } = buildService();
    analisisRepo.listarPendientesActivas.mockResolvedValueOnce([]);

    const resumen = await service.analizarPendientes();

    expect(resumen).toEqual({ totalEncontradas: 0, totalCompletadas: 0, totalFallidas: 0 });
  });
});
