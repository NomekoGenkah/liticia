import { describe, it, expect, vi, beforeEach } from "vitest";

const ingestarMock = vi.fn();

vi.mock("../services/ingestaLicitacionesService", () => ({
  IngestaLicitacionesService: vi.fn().mockImplementation(() => ({
    ingestar: ingestarMock,
  })),
}));

vi.mock("../clients/chileCompraClient", () => ({
  ChileCompraClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("../repositories/apiRequestCounterRepository", () => ({ apiRequestCounterRepository: {} }));
vi.mock("../repositories/ingestaRunRepository", () => ({ ingestaRunRepository: {} }));
vi.mock("../repositories/licitacionRepository", () => ({ licitacionRepository: {} }));
vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { ejecutarIngesta, estaEnProceso } from "./ingestaRunner";

const resumenVacio = { totalEncontradas: 0, totalNuevas: 0, totalActualizadas: 0, totalErrores: 0 };

describe("ingestaRunner", () => {
  beforeEach(() => {
    ingestarMock.mockReset();
  });

  it("rechaza con ConflictError un llamado concurrente mientras hay una ingesta en curso", async () => {
    let resolverPrimera: (value: typeof resumenVacio) => void = () => {};
    const primeraPromesa = new Promise<typeof resumenVacio>((resolve) => {
      resolverPrimera = resolve;
    });
    ingestarMock.mockReturnValueOnce(primeraPromesa);

    const primera = ejecutarIngesta({}, { disparadoPor: "MANUAL" });
    expect(estaEnProceso()).toBe(true);

    await expect(ejecutarIngesta({}, { disparadoPor: "MANUAL" })).rejects.toMatchObject({
      code: "INGESTA_EN_PROCESO",
      statusCode: 409,
    });

    resolverPrimera(resumenVacio);
    await primera;
    expect(estaEnProceso()).toBe(false);
  });

  it("libera el lock aunque la ingesta falle (finally)", async () => {
    ingestarMock.mockRejectedValueOnce(new Error("boom"));
    await expect(ejecutarIngesta({}, { disparadoPor: "CRON" })).rejects.toThrow("boom");
    expect(estaEnProceso()).toBe(false);

    ingestarMock.mockResolvedValueOnce(resumenVacio);
    await expect(ejecutarIngesta({}, { disparadoPor: "CRON" })).resolves.toEqual(resumenVacio);
    expect(estaEnProceso()).toBe(false);
  });
});
