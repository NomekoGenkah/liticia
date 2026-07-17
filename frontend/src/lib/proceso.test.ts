import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { estimarRestante } from "./proceso";
import type { RunVivo } from "@/types/procesos";

const AHORA = new Date("2026-07-17T12:00:00.000Z");

function run(parcial: Partial<RunVivo>): RunVivo {
  return {
    id: "r1",
    tipo: "ANALISIS",
    estado: "EN_PROCESO",
    fechaInicio: AHORA.toISOString(),
    fechaFin: null,
    total: 0,
    completadas: 0,
    fallidas: 0,
    omitidos: 0,
    objetoIds: [],
    actual: null,
    detalleError: null,
    ...parcial,
  };
}

describe("estimarRestante", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => vi.useRealTimers());

  it("no estima sin ningún ítem terminado: un ETA en el primer segundo es peor que nada", () => {
    expect(estimarRestante(run({ total: 4, completadas: 0 }))).toBeNull();
  });

  it("no estima cuando ya no queda nada por hacer", () => {
    expect(estimarRestante(run({ total: 4, completadas: 4 }))).toBeNull();
    expect(estimarRestante(run({ total: 4, completadas: 5 }))).toBeNull();
  });

  it("extrapola el tiempo restante a partir del ritmo medido", () => {
    // 2 de 4 hechas en 10s → quedan 2, a 5s cada una → 10s.
    const inicio = new Date(AHORA.getTime() - 10_000).toISOString();
    expect(estimarRestante(run({ total: 4, completadas: 2, fechaInicio: inicio }))).toBe(10_000);
  });

  it("cuenta fallidas y omitidas como progreso, no solo completadas", () => {
    const inicio = new Date(AHORA.getTime() - 9_000).toISOString();
    // 3 hechas (1 + 1 + 1) de 6 en 9s → quedan 3, a 3s cada una → 9s.
    expect(
      estimarRestante(run({ total: 6, completadas: 1, fallidas: 1, omitidos: 1, fechaInicio: inicio }))
    ).toBe(9_000);
  });
});
