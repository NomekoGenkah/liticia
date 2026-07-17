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
  nombreOrganismo: string | null;
  montoEstimado: number | null;
  moneda: string | null;
  regionUnidad: string | null;
  tipo: string | null;
  fechaCierre: Date | null;
  analisis: LicitacionAnalisisParaMatching;
}

/** Una licitación que se pidió matchear pero todavía no tiene análisis del cual partir. */
export interface DescriptorSinAnalisis {
  id: string;
  codigoExterno: string;
  nombre: string;
  nombreOrganismo: string | null;
}

/** Lo que el prompt de matching necesita de una licitación: sus datos y su análisis ya hecho. */
const SELECT_PARA_MATCHING = {
  id: true,
  codigoExterno: true,
  nombre: true,
  nombreOrganismo: true,
  montoEstimado: true,
  moneda: true,
  regionUnidad: true,
  tipo: true,
  fechaCierre: true,
  analisis: {
    select: {
      resumenEjecutivo: true,
      puntosClave: true,
      palabrasClave: true,
      nivelComplejidad: true,
      // listarPendientesActivas ya filtra por COMPLETADO en el where, pero listarPorIds no puede:
      // necesita distinguir las que no lo tienen para reportarlas como omitidas.
      estado: true,
    },
  },
} as const;

type FilaMatching = {
  id: string;
  codigoExterno: string;
  nombre: string;
  nombreOrganismo: string | null;
  montoEstimado: unknown;
  moneda: string | null;
  regionUnidad: string | null;
  tipo: string | null;
  fechaCierre: Date | null;
  analisis: (LicitacionAnalisisParaMatching & { estado: string }) | null;
};

const aLicitacionParaMatching = (l: FilaMatching): LicitacionParaMatchingPendiente => ({
  ...l,
  montoEstimado: l.montoEstimado ? Number(l.montoEstimado) : null,
  analisis: l.analisis as LicitacionAnalisisParaMatching,
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
   * Licitaciones activas ("Publicada") con análisis completado, sin matching vigente para el perfil
   * actual (sin fila, fila FALLIDA, o calculada contra una versión anterior del perfil).
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
        analisis: { estado: "COMPLETADO" },
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
   * Licitaciones puntuales por id. Sin prefiltro UNSPSC y sin el predicado de "pendiente" — las
   * eligió el usuario (ver el comentario de analisisLicitacionRepository.listarPorIds).
   *
   * Sí exige análisis completado, porque eso no es una preferencia sino la dependencia dura del
   * matching: sin análisis no hay con qué matchear. Las que no lo tengan salen por `sinAnalisis`
   * para que el llamador las reporte como omitidas en vez de hacerlas desaparecer.
   */
  async listarPorIds(
    ids: string[]
  ): Promise<{ listas: LicitacionParaMatchingPendiente[]; sinAnalisis: DescriptorSinAnalisis[] }> {
    const licitaciones = await prisma.licitacion.findMany({
      where: { id: { in: ids } },
      select: SELECT_PARA_MATCHING,
      orderBy: { fechaCierre: "asc" },
    });

    const listas: LicitacionParaMatchingPendiente[] = [];
    const sinAnalisis: DescriptorSinAnalisis[] = [];

    for (const l of licitaciones) {
      if (l.analisis?.estado === "COMPLETADO") {
        listas.push(aLicitacionParaMatching(l));
      } else {
        sinAnalisis.push({
          id: l.id,
          codigoExterno: l.codigoExterno,
          nombre: l.nombre,
          nombreOrganismo: l.nombreOrganismo,
        });
      }
    }

    return { listas, sinAnalisis };
  },
};
