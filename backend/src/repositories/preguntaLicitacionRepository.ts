import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

/** Un chunk que se usó como contexto. Se serializa en la columna `fuentes` (jsonb). */
export interface PreguntaFuente {
  documentoId: string;
  nombreArchivo: string;
  chunkIndex: number;
  /** Similitud coseno contra la pregunta, 0..1. */
  similitud: number;
  /** Primeros caracteres del chunk: suficiente para auditar la cita sin duplicar el documento. */
  extracto: string;
}

export interface PreguntaCrearInput {
  licitacionId: string;
  pregunta: string;
  respuesta: string;
  fuentes: PreguntaFuente[];
  modelo: string;
  promptVersion: number;
  duracionMs: number;
}

export const preguntaLicitacionRepository = {
  async crear(input: PreguntaCrearInput) {
    const { fuentes, ...resto } = input;

    return prisma.licitacionPregunta.create({
      data: { ...resto, fuentes: fuentes as unknown as Prisma.InputJsonValue },
    });
  },

  /** Ascendente: el historial se lee como una conversación. */
  async listarPorLicitacion(licitacionId: string) {
    return prisma.licitacionPregunta.findMany({
      where: { licitacionId },
      orderBy: { creadoEn: "asc" },
    });
  },
};
