import { describe, it, expect } from "vitest";
import { formatDuracion, formatMonto, formatBytes, formatFecha } from "./format";

describe("formatDuracion", () => {
  it("muestra solo segundos por debajo del minuto", () => {
    expect(formatDuracion(8000)).toBe("8s");
    expect(formatDuracion(0)).toBe("0s");
  });

  it("redondea y nunca da negativo", () => {
    expect(formatDuracion(1400)).toBe("1s");
    expect(formatDuracion(-5000)).toBe("0s");
  });

  it("corta en dos unidades: minutos y segundos, nunca tres", () => {
    expect(formatDuracion(150_000)).toBe("2m 30s");
    expect(formatDuracion(120_000)).toBe("2m");
  });

  it("con horas descarta los segundos, deja horas y minutos", () => {
    expect(formatDuracion(3_900_000)).toBe("1h 5m");
    expect(formatDuracion(3_600_000)).toBe("1h");
  });
});

describe("formatMonto", () => {
  it("formatea como moneda conocida", () => {
    // El separador de miles del es-CL es el punto; el símbolo puede variar por ICU, así que se
    // chequea el número y no el prefijo.
    expect(formatMonto("1000000", "CLP")).toContain("1.000.000");
  });

  it("cae al número plano con el código cuando Intl rechaza la moneda", () => {
    // Un código mal formado (no son 3 letras) hace throw en Intl y dispara el fallback.
    expect(formatMonto("5000", "XX")).toBe("5.000 XX");
  });

  it("no informa cuando el monto es null", () => {
    expect(formatMonto(null, "CLP")).toBe("No informado");
  });

  it("usa CLP cuando no viene moneda", () => {
    expect(formatMonto("2500", null)).toContain("2.500");
  });
});

describe("formatBytes", () => {
  it("deja los bytes crudos por debajo de 1 KB", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("escala a KB, MB y GB con un decimal", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
});

describe("formatFecha", () => {
  it("devuelve un guion para fechas nulas", () => {
    expect(formatFecha(null)).toBe("—");
  });
});
