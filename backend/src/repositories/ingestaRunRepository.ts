import { prisma } from "../config/prisma";
import type { Prisma } from "@prisma/client";
import { toSkipTake, buildPaginationMeta, type Pagination } from "../utils/pagination";

export const ingestaRunRepository = {
  async crear(parametros: Prisma.InputJsonValue, disparadoPor: "MANUAL" | "CRON") {
    return prisma.ingestaRun.create({ data: { parametros, disparadoPor } });
  },

  async cerrar(
    id: string,
    resumen: {
      totalEncontradas: number;
      totalNuevas: number;
      totalActualizadas: number;
      totalErrores: number;
      estado: "COMPLETADO" | "FALLIDO";
      detalleError?: string;
    }
  ) {
    return prisma.ingestaRun.update({
      where: { id },
      data: { ...resumen, fechaFin: new Date() },
    });
  },

  /**
   * Cierra las ingestas que quedaron EN_PROCESO porque el backend murió a mitad.
   *
   * Mismo razonamiento que procesoRunRepository.cerrarHuerfanos(): asume una sola instancia, y por
   * eso lo llama solo el arranque del servidor. Sin esto, un corte deja una fila EN_PROCESO para
   * siempre en el historial (y el lock en memoria, que sí se limpia solo al reiniciar, decía otra
   * cosa que la base).
   */
  async cerrarHuerfanas(): Promise<number> {
    const { count } = await prisma.ingestaRun.updateMany({
      where: { estado: "EN_PROCESO" },
      data: { estado: "INTERRUMPIDO", fechaFin: new Date() },
    });

    return count;
  },

  async listar(pagination: Pagination) {
    const { skip, take } = toSkipTake(pagination);
    const [runs, total] = await Promise.all([
      prisma.ingestaRun.findMany({ orderBy: { fechaInicio: "desc" }, skip, take }),
      prisma.ingestaRun.count(),
    ]);

    return { runs, meta: buildPaginationMeta(pagination, total) };
  },
};
