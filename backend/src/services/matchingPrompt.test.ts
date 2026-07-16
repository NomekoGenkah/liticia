import { describe, it, expect } from "vitest";
import { buildMatchingPrompt, MATCHING_PROMPT_VERSION } from "./matchingPrompt";
import type { LicitacionParaMatching, PerfilEmpresaParaMatching } from "../clients/ollamaClient.types";

const perfilBase: PerfilEmpresaParaMatching = {
  nombre: "Servicios Climáticos SpA",
  descripcion: "Empresa de mantención de equipos de climatización para edificios públicos y privados.",
  rubro: "Climatización",
  palabrasClave: ["climatización", "mantención"],
  categoriasUnspsc: ["72101507"],
  regionesInteres: ["Metropolitana de Santiago"],
  montoMinimo: 5000000,
  montoMaximo: 50000000,
};

const licitacionBase: LicitacionParaMatching = {
  nombre: "Mantención de equipos de climatización",
  nombreOrganismo: "Municipalidad de Ejemplo",
  montoEstimado: 15000000,
  moneda: "CLP",
  regionUnidad: "Metropolitana de Santiago",
  tipo: "L1",
  fechaCierre: new Date("2026-07-20T12:00:00Z"),
  analisis: {
    resumenEjecutivo: "Se licita la mantención preventiva y correctiva de equipos de climatización.",
    puntosClave: ["Requiere certificación técnica"],
    palabrasClave: ["mantención", "climatización"],
    nivelComplejidad: "MEDIA",
  },
};

describe("buildMatchingPrompt", () => {
  it("expone MATCHING_PROMPT_VERSION como constante estable", () => {
    expect(MATCHING_PROMPT_VERSION).toBe(1);
  });

  it("incluye los campos clave del perfil y de la licitación analizada en el prompt de usuario", () => {
    const { user } = buildMatchingPrompt(perfilBase, licitacionBase);

    expect(user).toContain(perfilBase.nombre);
    expect(user).toContain(perfilBase.descripcion);
    expect(user).toContain(perfilBase.rubro!);
    expect(user).toContain("climatización, mantención");
    expect(user).toContain(licitacionBase.nombre);
    expect(user).toContain(licitacionBase.nombreOrganismo!);
    expect(user).toContain(licitacionBase.analisis.resumenEjecutivo!);
    expect(user).toContain("Requiere certificación técnica");
    expect(user).toContain("MEDIA");
  });

  it("el prompt de sistema exige responder solo JSON, en español, sin inventar afinidad", () => {
    const { system } = buildMatchingPrompt(perfilBase, licitacionBase);

    expect(system).toMatch(/JSON/);
    expect(system).toMatch(/español/i);
    expect(system).toMatch(/no inventes/i);
  });

  it("cuando el perfil no declara categorías, región o rango de monto, lo indica explícitamente", () => {
    const perfilSinCriterios: PerfilEmpresaParaMatching = {
      ...perfilBase,
      palabrasClave: [],
      categoriasUnspsc: [],
      regionesInteres: [],
      montoMinimo: null,
      montoMaximo: null,
    };

    const { user } = buildMatchingPrompt(perfilSinCriterios, licitacionBase);

    expect(user).toMatch(/no declaradas/i);
    expect(user).toMatch(/no declarado/i);
  });

  it("cuando el análisis de la licitación no tiene resumen ni puntos clave, lo indica como no disponible", () => {
    const licitacionSinAnalisisRico: LicitacionParaMatching = {
      ...licitacionBase,
      analisis: { resumenEjecutivo: null, puntosClave: [], palabrasClave: [], nivelComplejidad: null },
    };

    const { user } = buildMatchingPrompt(perfilBase, licitacionSinAnalisisRico);

    expect(user).toMatch(/no disponible/i);
    expect(user).toMatch(/sin puntos clave/i);
  });
});
