import { describe, it, expect } from "vitest";
import { buildAnalisisPrompt, PROMPT_VERSION } from "./analisisPrompt";
import type { LicitacionParaAnalisis } from "../clients/ollamaClient.types";

const base: LicitacionParaAnalisis = {
  nombre: "Mantención de equipos de climatización",
  descripcion: "Servicio de mantención preventiva y correctiva para equipos de climatización en edificios públicos.",
  nombreOrganismo: "Municipalidad de Ejemplo",
  montoEstimado: 15000000,
  moneda: "CLP",
  tipo: "L1",
  fechaPublicacion: new Date("2026-07-01T12:00:00Z"),
  fechaCierre: new Date("2026-07-20T12:00:00Z"),
  items: [{ nombreProducto: "Mantención climatización", categoriaUnspsc: "72101507", cantidad: 1, unidadMedida: "unidad" }],
};

describe("buildAnalisisPrompt", () => {
  it("expone PROMPT_VERSION como constante estable", () => {
    expect(PROMPT_VERSION).toBe(1);
  });

  it("incluye los campos clave de la licitación en el prompt de usuario", () => {
    const { user } = buildAnalisisPrompt(base);

    expect(user).toContain(base.nombre);
    expect(user).toContain(base.nombreOrganismo!);
    expect(user).toContain(base.descripcion!);
    expect(user).toContain("Mantención climatización");
    expect(user).toContain("72101507");
    expect(user).toContain("2026-07-01");
    expect(user).toContain("2026-07-20");
  });

  it("el prompt de sistema exige responder solo JSON, en español, sin inventar contenido", () => {
    const { system } = buildAnalisisPrompt(base);

    expect(system).toMatch(/JSON/);
    expect(system).toMatch(/español/i);
    expect(system).toMatch(/no inventes/i);
  });

  it("cuando descripcion es null, instruye a no inventar contenido y a basarse en el resto de los campos", () => {
    const { user } = buildAnalisisPrompt({ ...base, descripcion: null });

    expect(user).toMatch(/sin descripción disponible/i);
    expect(user).toMatch(/no inventes contenido/i);
  });

  it("cuando descripcion es string vacío, se trata igual que null", () => {
    const { user } = buildAnalisisPrompt({ ...base, descripcion: "   " });

    expect(user).toMatch(/sin descripción disponible/i);
  });

  it("cuando no hay items, lo indica explícitamente", () => {
    const { user } = buildAnalisisPrompt({ ...base, items: [] });

    expect(user).toMatch(/sin ítems informados/i);
  });

  it("cuando montoEstimado es null, lo indica como no informado", () => {
    const { user } = buildAnalisisPrompt({ ...base, montoEstimado: null });

    expect(user).toMatch(/Monto estimado: no informado/);
  });
});
