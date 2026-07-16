import { describe, expect, it } from "vitest";
import { filtroPorSegmentos, segmentosDe } from "./unspsc";

describe("segmentosDe", () => {
  it("saca los dos primeros dígitos de cada código", () => {
    expect(segmentosDe(["43232400", "81111500", "83121700"])).toEqual(["43", "81", "83"]);
  });

  it("no repite el segmento cuando varios códigos lo comparten", () => {
    // Los 8 códigos del perfil real caen en solo 3 segmentos.
    const perfil = ["81111500", "81111600", "81111700", "81111800", "81112200", "43232400", "43232300", "83121700"];

    expect(segmentosDe(perfil)).toEqual(["43", "81", "83"]);
  });

  it("devuelve vacío si no hay códigos", () => {
    expect(segmentosDe([])).toEqual([]);
  });

  it("ignora códigos más cortos que un segmento", () => {
    expect(segmentosDe(["4", "", "43232400"])).toEqual(["43"]);
  });

  it("tolera espacios alrededor del código", () => {
    expect(segmentosDe([" 43232400 "])).toEqual(["43"]);
  });
});

describe("filtroPorSegmentos", () => {
  it("no filtra nada cuando no hay segmentos", () => {
    // Sin perfil el batch tiene que seguir procesando todo, como antes del filtro.
    expect(filtroPorSegmentos([])).toEqual({});
  });

  it("exige al menos un ítem de alguno de los segmentos", () => {
    expect(filtroPorSegmentos(["43", "81"])).toEqual({
      items: {
        some: {
          OR: [{ categoriaUnspsc: { startsWith: "43" } }, { categoriaUnspsc: { startsWith: "81" } }],
        },
      },
    });
  });
});
