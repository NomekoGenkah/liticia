import { prisma } from "../config/prisma";
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

  /** Licitaciones activas ("Publicada") sin análisis vigente (sin fila, o última fila FALLIDA). */
  async listarPendientesActivas(): Promise<LicitacionPendiente[]> {
    const licitaciones = await prisma.licitacion.findMany({
      where: {
        estado: { equals: "Publicada", mode: "insensitive" },
        OR: [{ analisis: null }, { analisis: { estado: "FALLIDO" } }],
      },
      select: {
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
      },
    });

    return licitaciones.map((l) => ({
      ...l,
      montoEstimado: l.montoEstimado ? Number(l.montoEstimado) : null,
    }));
  },
};
