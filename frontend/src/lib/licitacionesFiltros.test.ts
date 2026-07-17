import { describe, it, expect } from "vitest";
import { leerFiltros, ORDEN_POR_DEFECTO } from "./licitacionesFiltros";

describe("leerFiltros", () => {
  it("con una URL vacía deja todo sin filtrar y el orden por defecto", () => {
    const f = leerFiltros(new URLSearchParams());
    expect(f).toEqual({
      estado: undefined,
      codigoOrganismo: undefined,
      recomendacion: undefined,
      orderBy: ORDEN_POR_DEFECTO,
    });
  });

  it("lee estado, organismo y orden tal cual vienen", () => {
    const f = leerFiltros(new URLSearchParams("estado=Publicada&codigoOrganismo=6945&orderBy=puntaje:desc"));
    expect(f.estado).toBe("Publicada");
    expect(f.codigoOrganismo).toBe("6945");
    expect(f.orderBy).toBe("puntaje:desc");
  });

  it("acepta las recomendaciones válidas", () => {
    expect(leerFiltros(new URLSearchParams("recomendacion=SI")).recomendacion).toBe("SI");
    expect(leerFiltros(new URLSearchParams("recomendacion=TAL_VEZ")).recomendacion).toBe("TAL_VEZ");
  });

  it("descarta una recomendación inválida en vez de dejarla pasar (la URL la escribe cualquiera)", () => {
    expect(leerFiltros(new URLSearchParams("recomendacion=QUIZAS")).recomendacion).toBeUndefined();
    expect(leerFiltros(new URLSearchParams("recomendacion=si")).recomendacion).toBeUndefined();
  });
});
