import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { aplicar, keyEstadoProceso, keyStreamProceso, type StreamProceso } from "./useProcesoEventos";
import type { EstadoProceso, ItemActual, RunVivo } from "@/types/procesos";

const TIPO = "ANALISIS" as const;

function runVivo(parcial: Partial<RunVivo> = {}): RunVivo {
  return {
    id: "r1",
    tipo: TIPO,
    estado: "EN_PROCESO",
    fechaInicio: "2026-07-17T12:00:00.000Z",
    fechaFin: null,
    total: 10,
    completadas: 0,
    fallidas: 0,
    omitidos: 0,
    objetoIds: [],
    actual: null,
    detalleError: null,
    ...parcial,
  };
}

function itemActual(parcial: Partial<ItemActual> = {}): ItemActual {
  return {
    objetoId: "o1",
    etiqueta: "1234-5-L1",
    titulo: "Una licitación",
    subtitulo: null,
    indice: 0,
    fechaInicio: "2026-07-17T12:00:00.000Z",
    texto: "",
    pensamiento: "",
    ...parcial,
  };
}

describe("aplicar (reductor de eventos SSE)", () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
  });

  const estado = () => qc.getQueryData<EstadoProceso>(keyEstadoProceso(TIPO));
  const stream = () => qc.getQueryData<StreamProceso>(keyStreamProceso(TIPO));

  it("el snapshot pisa el estado local y siembra el stream con el texto del ítem en curso", () => {
    // Estado local previo que el snapshot tiene que descartar.
    qc.setQueryData(keyEstadoProceso(TIPO), { enProceso: false, run: runVivo({ completadas: 99 }) });

    const nuevo: EstadoProceso = {
      enProceso: true,
      run: runVivo({ completadas: 3, actual: itemActual({ texto: "hola", pensamiento: "mmm" }) }),
    };
    aplicar(qc, { tipo: TIPO, evento: "snapshot", estado: nuevo });

    expect(estado()).toEqual(nuevo);
    expect(stream()).toEqual({ texto: "hola", pensamiento: "mmm" });
  });

  it("los tokens NO tocan la query del estado; solo acumulan en el stream por canal", () => {
    const previo: EstadoProceso = { enProceso: true, run: runVivo({ completadas: 2 }) };
    qc.setQueryData(keyEstadoProceso(TIPO), previo);

    aplicar(qc, { tipo: TIPO, evento: "token", texto: "Hola ", canal: "respuesta" });
    aplicar(qc, { tipo: TIPO, evento: "token", texto: "mundo", canal: "respuesta" });
    aplicar(qc, { tipo: TIPO, evento: "token", texto: "pensando", canal: "pensamiento" });

    // El estado quedó intacto: el reductor no debe re-renderizar barra/contadores por cada token.
    expect(estado()).toBe(previo);
    expect(stream()).toEqual({ texto: "Hola mundo", pensamiento: "pensando" });
  });

  it("item-reintentado descarta el buffer del stream: la salida del intento fallido no es válida", () => {
    qc.setQueryData<StreamProceso>(keyStreamProceso(TIPO), { texto: "a medio escribir", pensamiento: "x" });

    aplicar(qc, { tipo: TIPO, evento: "item-reintentado", intento: 2 });

    expect(stream()).toEqual({ texto: "", pensamiento: "" });
  });

  it("item-iniciado limpia el stream y engancha el nuevo ítem al run", () => {
    qc.setQueryData(keyEstadoProceso(TIPO), { enProceso: true, run: runVivo() });
    qc.setQueryData<StreamProceso>(keyStreamProceso(TIPO), { texto: "viejo", pensamiento: "viejo" });

    const actual = itemActual({ objetoId: "o2", indice: 1 });
    aplicar(qc, { tipo: TIPO, evento: "item-iniciado", actual });

    expect(stream()).toEqual({ texto: "", pensamiento: "" });
    expect(estado()?.run?.actual).toEqual(actual);
  });

  it("los contadores de item-finalizado llegan acumulados, no como deltas", () => {
    qc.setQueryData(keyEstadoProceso(TIPO), {
      enProceso: true,
      run: runVivo({ completadas: 2, fallidas: 1, omitidos: 0 }),
    });

    aplicar(qc, {
      tipo: TIPO,
      evento: "item-finalizado",
      indice: 3,
      objetoId: "o4",
      etiqueta: "1234-5-L1",
      estado: "COMPLETADO",
      duracionMs: 1000,
      detalleError: null,
      completadas: 5,
      fallidas: 1,
      omitidos: 2,
    });

    const run = estado()?.run;
    // Absolutos: 5/1/2, no 2+5, 1+1, 0+2.
    expect(run?.completadas).toBe(5);
    expect(run?.fallidas).toBe(1);
    expect(run?.omitidos).toBe(2);
  });
});
