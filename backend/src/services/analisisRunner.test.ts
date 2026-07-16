import { describe, it, expect, vi, beforeEach } from "vitest";

const analizarUnaMock = vi.fn();
const analizarPendientesMock = vi.fn();

vi.mock("../services/analisisLicitacionesService", () => ({
  AnalisisLicitacionesService: vi.fn().mockImplementation(() => ({
    analizarUna: analizarUnaMock,
    analizarPendientes: analizarPendientesMock,
  })),
}));

vi.mock("../clients/ollamaClient", () => ({
  OllamaClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../repositories/analisisLicitacionRepository", () => ({ analisisLicitacionRepository: {} }));
vi.mock("../repositories/licitacionRepository", () => ({ licitacionRepository: {} }));
vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  analizarLicitacion,
  ejecutarAnalisisPendientes,
  estaAnalisisEnProceso,
  iniciarAnalisisPendientes,
} from "./analisisRunner";

const resultadoVacio = { id: "abc", estado: "COMPLETADO" };
const resumenVacio = { totalEncontradas: 0, totalCompletadas: 0, totalFallidas: 0 };

describe("analisisRunner", () => {
  beforeEach(() => {
    analizarUnaMock.mockReset();
    analizarPendientesMock.mockReset();
  });

  it("rechaza con ConflictError un llamado concurrente a analizarLicitacion mientras hay uno en curso", async () => {
    let resolverPrimera: (value: typeof resultadoVacio) => void = () => {};
    const primeraPromesa = new Promise<typeof resultadoVacio>((resolve) => {
      resolverPrimera = resolve;
    });
    analizarUnaMock.mockReturnValueOnce(primeraPromesa);

    const primera = analizarLicitacion("123-45-LE24");
    expect(estaAnalisisEnProceso()).toBe(true);

    await expect(analizarLicitacion("999-99-LE24")).rejects.toMatchObject({
      code: "ANALISIS_EN_PROCESO",
      statusCode: 409,
    });

    resolverPrimera(resultadoVacio);
    await primera;
    expect(estaAnalisisEnProceso()).toBe(false);
  });

  it("libera el lock aunque analizarLicitacion falle (finally)", async () => {
    analizarUnaMock.mockRejectedValueOnce(new Error("boom"));
    await expect(analizarLicitacion("123-45-LE24")).rejects.toThrow("boom");
    expect(estaAnalisisEnProceso()).toBe(false);

    analizarUnaMock.mockResolvedValueOnce(resultadoVacio);
    await expect(analizarLicitacion("123-45-LE24")).resolves.toEqual(resultadoVacio);
    expect(estaAnalisisEnProceso()).toBe(false);
  });

  it("el lock es compartido: iniciarAnalisisPendientes bloquea una llamada concurrente a analizarLicitacion", async () => {
    let resolverBatch: (value: typeof resumenVacio) => void = () => {};
    const batchPromesa = new Promise<typeof resumenVacio>((resolve) => {
      resolverBatch = resolve;
    });
    analizarPendientesMock.mockReturnValueOnce(batchPromesa);

    iniciarAnalisisPendientes();
    expect(estaAnalisisEnProceso()).toBe(true);

    await expect(analizarLicitacion("123-45-LE24")).rejects.toMatchObject({
      code: "ANALISIS_EN_PROCESO",
      statusCode: 409,
    });

    resolverBatch(resumenVacio);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(estaAnalisisEnProceso()).toBe(false);
  });

  it("ejecutarAnalisisPendientes espera el resultado completo del batch y libera el lock", async () => {
    analizarPendientesMock.mockResolvedValueOnce(resumenVacio);
    await expect(ejecutarAnalisisPendientes()).resolves.toEqual(resumenVacio);
    expect(estaAnalisisEnProceso()).toBe(false);
  });

  it("ejecutarAnalisisPendientes rechaza con ConflictError si ya hay un análisis en curso", async () => {
    let resolverPrimera: (value: typeof resultadoVacio) => void = () => {};
    const primeraPromesa = new Promise<typeof resultadoVacio>((resolve) => {
      resolverPrimera = resolve;
    });
    analizarUnaMock.mockReturnValueOnce(primeraPromesa);

    const primera = analizarLicitacion("123-45-LE24");
    await expect(ejecutarAnalisisPendientes()).rejects.toMatchObject({
      code: "ANALISIS_EN_PROCESO",
      statusCode: 409,
    });

    resolverPrimera(resultadoVacio);
    await primera;
  });
});
