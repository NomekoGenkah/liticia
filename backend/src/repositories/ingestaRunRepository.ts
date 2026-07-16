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

  async listar(pagination: Pagination) {
    const { skip, take } = toSkipTake(pagination);
    const [runs, total] = await Promise.all([
      prisma.ingestaRun.findMany({ orderBy: { fechaInicio: "desc" }, skip, take }),
      prisma.ingestaRun.count(),
    ]);

    return { runs, meta: buildPaginationMeta(pagination, total) };
  },
};
