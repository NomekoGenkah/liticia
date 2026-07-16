import { describe, it, expect, vi, beforeEach } from "vitest";

const matchearUnaMock = vi.fn();
const matchearPendientesMock = vi.fn();

vi.mock("./matchingLicitacionesService", () => ({
  MatchingLicitacionesService: vi.fn().mockImplementation(() => ({
    matchearUna: matchearUnaMock,
    matchearPendientes: matchearPendientesMock,
  })),
}));

vi.mock("../clients/ollamaClient", () => ({
  OllamaClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../repositories/matchingLicitacionRepository", () => ({ matchingLicitacionRepository: {} }));
vi.mock("../repositories/perfilEmpresaRepository", () => ({ perfilEmpresaRepository: {} }));
vi.mock("../repositories/licitacionRepository", () => ({ licitacionRepository: {} }));
vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  ejecutarMatchingPendientes,
  estaMatchingEnProceso,
  iniciarMatchingPendientes,
  matchearLicitacion,
} from "./matchingRunner";

const resultadoVacio = { id: "abc", estado: "COMPLETADO" };
const resumenVacio = { totalEncontradas: 0, totalCompletadas: 0, totalFallidas: 0 };

describe("matchingRunner", () => {
  beforeEach(() => {
    matchearUnaMock.mockReset();
    matchearPendientesMock.mockReset();
  });

  it("rechaza con ConflictError un llamado concurrente a matchearLicitacion mientras hay uno en curso", async () => {
    let resolverPrimera: (value: typeof resultadoVacio) => void = () => {};
    const primeraPromesa = new Promise<typeof resultadoVacio>((resolve) => {
      resolverPrimera = resolve;
    });
    matchearUnaMock.mockReturnValueOnce(primeraPromesa);

    const primera = matchearLicitacion("123-45-LE24");
    expect(estaMatchingEnProceso()).toBe(true);

    await expect(matchearLicitacion("999-99-LE24")).rejects.toMatchObject({
      code: "MATCHING_EN_PROCESO",
      statusCode: 409,
    });

    resolverPrimera(resultadoVacio);
    await primera;
    expect(estaMatchingEnProceso()).toBe(false);
  });

  it("libera el lock aunque matchearLicitacion falle (finally)", async () => {
    matchearUnaMock.mockRejectedValueOnce(new Error("boom"));
    await expect(matchearLicitacion("123-45-LE24")).rejects.toThrow("boom");
    expect(estaMatchingEnProceso()).toBe(false);

    matchearUnaMock.mockResolvedValueOnce(resultadoVacio);
    await expect(matchearLicitacion("123-45-LE24")).resolves.toEqual(resultadoVacio);
    expect(estaMatchingEnProceso()).toBe(false);
  });

  it("ejecutarMatchingPendientes espera el resultado completo del batch y libera el lock", async () => {
    matchearPendientesMock.mockResolvedValueOnce(resumenVacio);
    await expect(ejecutarMatchingPendientes()).resolves.toEqual(resumenVacio);
    expect(estaMatchingEnProceso()).toBe(false);
  });

  it("ejecutarMatchingPendientes rechaza con ConflictError si ya hay un matching en curso", async () => {
    let resolverPrimera: (value: typeof resultadoVacio) => void = () => {};
    const primeraPromesa = new Promise<typeof resultadoVacio>((resolve) => {
      resolverPrimera = resolve;
    });
    matchearUnaMock.mockReturnValueOnce(primeraPromesa);

    const primera = matchearLicitacion("123-45-LE24");
    await expect(ejecutarMatchingPendientes()).rejects.toMatchObject({
      code: "MATCHING_EN_PROCESO",
      statusCode: 409,
    });

    resolverPrimera(resultadoVacio);
    await primera;
  });

  it("iniciarMatchingPendientes dispara el batch en background y libera el lock al terminar", async () => {
    let resolverBatch: (value: typeof resumenVacio) => void = () => {};
    const batchPromesa = new Promise<typeof resumenVacio>((resolve) => {
      resolverBatch = resolve;
    });
    matchearPendientesMock.mockReturnValueOnce(batchPromesa);

    iniciarMatchingPendientes();
    expect(estaMatchingEnProceso()).toBe(true);

    resolverBatch(resumenVacio);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(estaMatchingEnProceso()).toBe(false);
  });
});
