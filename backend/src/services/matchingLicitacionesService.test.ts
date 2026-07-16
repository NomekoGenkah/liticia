import { describe, it, expect, vi } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../config/env", () => ({ config: { OLLAMA_MODEL: "qwen3:8b" } }));

import { MatchingLicitacionesService } from "./matchingLicitacionesService";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors";
import type { LicitacionParaMatchingPendiente } from "../repositories/matchingLicitacionRepository";

const perfilBase = {
  id: "perfil-1",
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

function buildService() {
  const ollamaClient = { generarMatching: vi.fn() };
  const licitacionRepo = { findByCodigoExterno: vi.fn() };
  const perfilEmpresaRepo = { obtener: vi.fn() };
  const matchingRepo = {
    guardarCompletado: vi.fn().mockResolvedValue({ id: "match-1", duracionMs: 10 }),
    guardarFallido: vi.fn().mockResolvedValue({ id: "match-1" }),
    listarPendientesActivas: vi.fn(),
  };

  const service = new MatchingLicitacionesService(
    ollamaClient as never,
    licitacionRepo as never,
    perfilEmpresaRepo as never,
    matchingRepo as never
  );

  return { service, ollamaClient, licitacionRepo, perfilEmpresaRepo, matchingRepo };
}

describe("MatchingLicitacionesService.matchearUna", () => {
  it("lanza NotFoundError si la licitación no existe", async () => {
    const { service, licitacionRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce(null);

    await expect(service.matchearUna("no-existe")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lanza UnprocessableEntityError (ANALISIS_REQUERIDO) si la licitación no tiene análisis completado", async () => {
    const { service, licitacionRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce({ ...licitacionConAnalisisCompletado, analisis: null });

    await expect(service.matchearUna("123-45-LE24")).rejects.toMatchObject({
      code: "ANALISIS_REQUERIDO",
      statusCode: 422,
    });
  });

  it("lanza UnprocessableEntityError (PERFIL_EMPRESA_REQUERIDO) si no hay perfil configurado", async () => {
    const { service, licitacionRepo, perfilEmpresaRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce(licitacionConAnalisisCompletado);
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(null);

    await expect(service.matchearUna("123-45-LE24")).rejects.toMatchObject({
      code: "PERFIL_EMPRESA_REQUERIDO",
      statusCode: 422,
    });
  });

  it("guarda el matching completado en éxito", async () => {
    const { service, ollamaClient, licitacionRepo, perfilEmpresaRepo, matchingRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce(licitacionConAnalisisCompletado);
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
    ollamaClient.generarMatching.mockResolvedValueOnce(resultadoLlm);

    const resultado = await service.matchearUna("123-45-LE24");

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
    const { service, ollamaClient, licitacionRepo, perfilEmpresaRepo, matchingRepo } = buildService();
    licitacionRepo.findByCodigoExterno.mockResolvedValueOnce(licitacionConAnalisisCompletado);
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
    ollamaClient.generarMatching.mockRejectedValueOnce(new Error("ollama caído"));

    await expect(service.matchearUna("123-45-LE24")).rejects.toThrow("ollama caído");

    expect(matchingRepo.guardarFallido).toHaveBeenCalledWith(
      expect.objectContaining({ licitacionId: "lic-1", detalleError: "ollama caído", perfilVersion: 1 })
    );
    expect(matchingRepo.guardarCompletado).not.toHaveBeenCalled();
  });
});

describe("MatchingLicitacionesService.matchearPendientes", () => {
  it("lanza UnprocessableEntityError si no hay perfil configurado", async () => {
    const { service, perfilEmpresaRepo } = buildService();
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(null);

    await expect(service.matchearPendientes()).rejects.toBeInstanceOf(UnprocessableEntityError);
  });

  it("continúa tras un error por ítem y agrega los contadores correctamente", async () => {
    const { service, ollamaClient, perfilEmpresaRepo, matchingRepo } = buildService();
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);

    const pendientes: LicitacionParaMatchingPendiente[] = [
      { ...licitacionConAnalisisCompletado, id: "lic-1", codigoExterno: "cod-1", analisis: licitacionConAnalisisCompletado.analisis },
      { ...licitacionConAnalisisCompletado, id: "lic-2", codigoExterno: "cod-2", analisis: licitacionConAnalisisCompletado.analisis },
      { ...licitacionConAnalisisCompletado, id: "lic-3", codigoExterno: "cod-3", analisis: licitacionConAnalisisCompletado.analisis },
    ];
    matchingRepo.listarPendientesActivas.mockResolvedValueOnce(pendientes);

    ollamaClient.generarMatching
      .mockResolvedValueOnce(resultadoLlm)
      .mockRejectedValueOnce(new Error("falla puntual"))
      .mockResolvedValueOnce(resultadoLlm);

    const resumen = await service.matchearPendientes();

    expect(resumen).toEqual({ totalEncontradas: 3, totalCompletadas: 2, totalFallidas: 1 });
    expect(matchingRepo.guardarCompletado).toHaveBeenCalledTimes(2);
    expect(matchingRepo.guardarFallido).toHaveBeenCalledTimes(1);
    expect(matchingRepo.listarPendientesActivas).toHaveBeenCalledWith(1);
  });

  it("devuelve contadores en cero si no hay pendientes", async () => {
    const { service, perfilEmpresaRepo, matchingRepo } = buildService();
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfilBase);
    matchingRepo.listarPendientesActivas.mockResolvedValueOnce([]);

    const resumen = await service.matchearPendientes();

    expect(resumen).toEqual({ totalEncontradas: 0, totalCompletadas: 0, totalFallidas: 0 });
  });
});
