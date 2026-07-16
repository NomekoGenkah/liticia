import { prisma } from "../config/prisma";
import type { LicitacionAnalisisParaMatching } from "../clients/ollamaClient.types";

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

  /** Licitaciones activas ("Publicada") con análisis completado, sin matching vigente para el perfil actual. */
  async listarPendientesActivas(perfilVersionActual: number): Promise<LicitacionParaMatchingPendiente[]> {
    const licitaciones = await prisma.licitacion.findMany({
      where: {
        estado: { equals: "Publicada", mode: "insensitive" },
        analisis: { estado: "COMPLETADO" },
        OR: [
          { matching: null },
          { matching: { estado: "FALLIDO" } },
          { matching: { perfilVersion: { not: perfilVersionActual } } },
        ],
      },
      select: {
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
          select: { resumenEjecutivo: true, puntosClave: true, palabrasClave: true, nivelComplejidad: true },
        },
      },
    });

    return licitaciones.map((l) => ({
      ...l,
      montoEstimado: l.montoEstimado ? Number(l.montoEstimado) : null,
      analisis: l.analisis as LicitacionAnalisisParaMatching,
    }));
  },
};
