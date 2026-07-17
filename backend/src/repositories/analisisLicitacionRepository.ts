import { prisma } from "../config/prisma";
import { filtroPorSegmentos } from "../utils/unspsc";
import type { LicitacionParaAnalisis } from "../clients/ollamaClient.types";

export interface AnalisisCompletadoInput {
  licitacionId: string;
  resumenEjecutivo: string;
  puntosClave: string[];
  palabrasClave: string[];
  nivelComplejidad: "BAJA" | "MEDIA" | "ALTA";
  modelo: string;
  promptVersion: number;
  duracionMs: number;
}

export interface AnalisisFallidoInput {
  licitacionId: string;
  modelo: string;
  promptVersion: number;
  duracionMs: number;
  detalleError: string;
}

export interface LicitacionPendiente extends LicitacionParaAnalisis {
  id: string;
  codigoExterno: string;
}

/** Lo único que el prompt de análisis necesita de una licitación. */
const SELECT_PARA_ANALISIS = {
  id: true,
  codigoExterno: true,
  nombre: true,
  descripcion: true,
  nombreOrganismo: true,
  montoEstimado: true,
  moneda: true,
  tipo: true,
  fechaPublicacion: true,
  fechaCierre: true,
  items: {
    select: { nombreProducto: true, categoriaUnspsc: true, cantidad: true, unidadMedida: true },
  },
} as const;

type FilaSeleccionada = Omit<LicitacionPendiente, "montoEstimado"> & { montoEstimado: unknown };

/** Decimal de Prisma → number: el prompt trabaja con números, no con el wrapper del driver. */
const aLicitacionPendiente = (l: FilaSeleccionada): LicitacionPendiente => ({
  ...l,
  montoEstimado: l.montoEstimado ? Number(l.montoEstimado) : null,
});

export const analisisLicitacionRepository = {
  async guardarCompletado(input: AnalisisCompletadoInput) {
    const { licitacionId, ...data } = input;
    return prisma.licitacionAnalisis.upsert({
      where: { licitacionId },
      create: { licitacionId, ...data, estado: "COMPLETADO", intentos: 1 },
      update: { ...data, estado: "COMPLETADO", detalleError: null, intentos: { increment: 1 } },
    });
  },

  async guardarFallido(input: AnalisisFallidoInput) {
    const { licitacionId, ...data } = input;
    return prisma.licitacionAnalisis.upsert({
      where: { licitacionId },
      create: { licitacionId, ...data, estado: "FALLIDO", intentos: 1 },
      update: { ...data, estado: "FALLIDO", intentos: { increment: 1 } },
    });
  },

  /**
   * Licitaciones activas ("Publicada") sin análisis vigente (sin fila, o última fila FALLIDA).
   *
   * @param segmentosUnspsc Si viene con valores, solo devuelve licitaciones con al menos un ítem de
   * esos segmentos. Vacío o sin definir procesa todas (comportamiento de siempre).
   */
  async listarPendientesActivas(segmentosUnspsc: string[] = []): Promise<LicitacionPendiente[]> {
    const licitaciones = await prisma.licitacion.findMany({
      where: {
        estado: { equals: "Publicada", mode: "insensitive" },
        OR: [{ analisis: null }, { analisis: { estado: "FALLIDO" } }],
        ...filtroPorSegmentos(segmentosUnspsc),
      },
      select: SELECT_PARA_ANALISIS,
      // El orden importa: sin él, "23 de 140" y el tiempo estimado no significan nada entre
      // corridas. Y procesar primero lo que cierra antes es lo correcto para quien cancela a mitad.
      orderBy: { fechaCierre: "asc" },
    });

    return licitaciones.map(aLicitacionPendiente);
  },

  /**
   * Licitaciones puntuales por id, sin filtro alguno.
   *
   * Ni prefiltro UNSPSC ni predicado de "pendiente", a diferencia de listarPendientesActivas: el
   * prefiltro decide a qué vale la pena gastarle LLM cuando elige el sistema; cuando las elige el
   * usuario, ya decidió. Aplicarlo acá haría que "analizar 5 seleccionadas" analice 2 en silencio.
   */
  async listarPorIds(ids: string[]): Promise<LicitacionPendiente[]> {
    const licitaciones = await prisma.licitacion.findMany({
      where: { id: { in: ids } },
      select: SELECT_PARA_ANALISIS,
      orderBy: { fechaCierre: "asc" },
    });

    return licitaciones.map(aLicitacionPendiente);
  },
};
