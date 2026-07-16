import { prisma } from "../config/prisma";
import type { Prisma } from "@prisma/client";

export const ingestaRunRepository = {
  async crear(parametros: Prisma.InputJsonValue) {
    return prisma.ingestaRun.create({ data: { parametros } });
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
};
