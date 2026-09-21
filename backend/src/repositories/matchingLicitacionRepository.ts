import { prisma } from "../config/prisma";
import type { LicitacionAnalisisParaMatching } from "../clients/ollamaClient.types";
import { filtroPorSegmentos } from "../utils/unspsc";

export interface MatchingCompletadoInput {
  licitacionId: string;
  puntaje: number;
  recomendacion: "SI" | "NO" | "TAL_VEZ";
  justificacion: string;
  modelo: string;
  promptVersion: number;
  perfilVersion: number;
  duracionMs: number;
}

export interface MatchingFallidoInput {
  licitacionId: string;
  modelo: string;
  promptVersion: number;
  perfilVersion: number;
  duracionMs: number;
  detalleError: string;
}

export interface LicitacionParaMatchingPendiente {
  id: string;
  codigoExterno: string;
  nombre: string;
  descripcion: string | null;
  nombreOrganismo: string | null;
  montoEstimado: number | null;
  moneda: string | null;
  regionUnidad: string | null;
  tipo: string | null;
  fechaCierre: Date | null;
  items: Array<{
    nombreProducto: string;
    categoriaUnspsc: string | null;
    cantidad: number | null;
    unidadMedida: string | null;
  }>;
  analisis: LicitacionAnalisisParaMatching | null;
}

/** Descriptor conservado para compatibilidad de tipos si se reportan ítems omitidos. */
export interface DescriptorSinAnalisis {
  id: string;
  codigoExterno: string;
  nombre: string;
  nombreOrganismo: string | null;
}

/** Lo que el prompt o servicio de matching necesita de una licitación: datos base, items y análisis opcional. */
const SELECT_PARA_MATCHING = {
  id: true,
  codigoExterno: true,
  nombre: true,
  descripcion: true,
  nombreOrganismo: true,
  montoEstimado: true,
  moneda: true,
  regionUnidad: true,
  tipo: true,
  fechaCierre: true,
  items: {
    select: {
      nombreProducto: true,
      categoriaUnspsc: true,
      cantidad: true,
      unidadMedida: true,
    },
  },
  analisis: {
    select: {
      resumenEjecutivo: true,
      puntosClave: true,
      palabrasClave: true,
      nivelComplejidad: true,
      estado: true,
    },
  },
} as const;

type FilaMatching = {
  id: string;
  codigoExterno: string;
  nombre: string;
  descripcion: string | null;
  nombreOrganismo: string | null;
  montoEstimado: unknown;
  moneda: string | null;
  regionUnidad: string | null;
  tipo: string | null;
  fechaCierre: Date | null;
  items: Array<{
    nombreProducto: string;
    categoriaUnspsc: string | null;
    cantidad: unknown;
    unidadMedida: string | null;
  }>;
  analisis: (LicitacionAnalisisParaMatching & { estado: string }) | null;
};

const aLicitacionParaMatching = (l: FilaMatching): LicitacionParaMatchingPendiente => ({
  ...l,
  montoEstimado: l.montoEstimado ? Number(l.montoEstimado) : null,
  items: l.items.map((it) => ({
    ...it,
    cantidad: it.cantidad !== null && it.cantidad !== undefined ? Number(it.cantidad) : null,
  })),
  analisis: l.analisis ? (l.analisis as LicitacionAnalisisParaMatching) : null,
});

export const matchingLicitacionRepository = {
  async guardarCompletado(input: MatchingCompletadoInput) {
    const { licitacionId, ...data } = input;
    return prisma.licitacionMatching.upsert({
      where: { licitacionId },
      create: { licitacionId, ...data, estado: "COMPLETADO", intentos: 1 },
      update: { ...data, estado: "COMPLETADO", detalleError: null, intentos: { increment: 1 } },
    });
  },

  async guardarFallido(input: MatchingFallidoInput) {
    const { licitacionId, ...data } = input;
    return prisma.licitacionMatching.upsert({
      where: { licitacionId },
      create: { licitacionId, ...data, estado: "FALLIDO", intentos: 1 },
      update: { ...data, estado: "FALLIDO", intentos: { increment: 1 } },
    });
  },

  /**
   * Licitaciones activas ("Publicada") sin matching vigente para el perfil actual (sin fila,
   * fila FALLIDA, o calculada contra una versión anterior del perfil).
   * Ya no exige análisis previo: evalúa directamente las licitaciones activas.
   *
   * @param segmentosUnspsc Si viene con valores, solo devuelve licitaciones con al menos un ítem de
   * esos segmentos. Vacío o sin definir procesa todas (comportamiento de siempre).
   */
  async listarPendientesActivas(
    perfilVersionActual: number,
    segmentosUnspsc: string[] = []
  ): Promise<LicitacionParaMatchingPendiente[]> {
    const licitaciones = await prisma.licitacion.findMany({
      where: {
        estado: { equals: "Publicada", mode: "insensitive" },
        OR: [
          { matching: null },
          { matching: { estado: "FALLIDO" } },
          { matching: { perfilVersion: { not: perfilVersionActual } } },
        ],
        ...filtroPorSegmentos(segmentosUnspsc),
      },
      select: SELECT_PARA_MATCHING,
      // Ver el comentario equivalente en analisisLicitacionRepository: sin orden estable el
      // progreso y el tiempo estimado no significan nada.
      orderBy: { fechaCierre: "asc" },
    });

    return licitaciones.map(aLicitacionParaMatching);
  },

  /**
   * Licitaciones puntuales por id. Sin prefiltro UNSPSC y sin el predicado de "pendiente".
   * Como la calificación evalúa directamente los datos oficiales de ChileCompra, todas las
   * licitaciones encontradas se incluyen en `listas` para ser procesadas.
   */
  async listarPorIds(
    ids: string[]
  ): Promise<{ listas: LicitacionParaMatchingPendiente[]; sinAnalisis: DescriptorSinAnalisis[] }> {
    const licitaciones = await prisma.licitacion.findMany({
      where: { id: { in: ids } },
      select: SELECT_PARA_MATCHING,
      orderBy: { fechaCierre: "asc" },
    });

    return {
      listas: licitaciones.map(aLicitacionParaMatching),
      sinAnalisis: [],
    };
  },
};
