import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type {
  DescriptorItem,
  ItemOmitido,
  ProcesoDisparador,
  ProcesoItemEstado,
  ProcesoRunEstado,
  ProcesoTipo,
  ResumenProceso,
} from "../types/procesos";
import { buildPaginationMeta, toSkipTake, type Pagination } from "../utils/pagination";

interface CrearRunInput {
  tipo: ProcesoTipo;
  disparadoPor: ProcesoDisparador;
  modelo: string;
  parametros: Prisma.InputJsonValue;
  items: DescriptorItem[];
  omitidos: ItemOmitido[];
}

export const procesoRunRepository = {
  /**
   * Crea el run con toda su cola ya escrita. Los ítems se insertan PENDIENTE de entrada para que la
   * base sea la fuente de verdad de qué había que hacer: si el proceso muere, el historial ya sabe
   * qué quedó sin procesar sin depender de nada en memoria.
   */
  async crear(input: CrearRunInput) {
    return prisma.procesoRun.create({
      data: {
        tipo: input.tipo,
        disparadoPor: input.disparadoPor,
        modelo: input.modelo,
        parametros: input.parametros,
        totalEncontradas: input.items.length,
        totalOmitidos: input.omitidos.length,
        items: {
          createMany: {
            data: [
              ...input.items.map((item, orden) => ({
                objetoId: item.objetoId,
                etiqueta: item.etiqueta,
                titulo: item.titulo,
                subtitulo: item.subtitulo,
                orden,
              })),
              // Los omitidos entran ya cerrados: nunca se van a procesar, pero el historial tiene
              // que poder explicar por qué quedaron afuera.
              ...input.omitidos.map((item, i) => ({
                objetoId: item.objetoId,
                etiqueta: item.etiqueta,
                titulo: item.titulo,
                subtitulo: item.subtitulo,
                orden: input.items.length + i,
                estado: "OMITIDO" as const,
                detalleError: item.motivo,
              })),
            ],
          },
        },
      },
    });
  },

  async marcarItemEnProceso(runId: string, orden: number) {
    return prisma.procesoRunItem.update({
      where: { runId_orden: { runId, orden } },
      data: { estado: "EN_PROCESO", fechaInicio: new Date() },
    });
  },

  async closeItem(
    runId: string,
    orden: number,
    datos: { estado: ProcesoItemEstado; duracionMs: number; detalleError: string | null }
  ) {
    return prisma.procesoRunItem.update({
      where: { runId_orden: { runId, orden } },
      data: { ...datos, fechaFin: new Date() },
    });
  },

  async close(
    runId: string,
    datos: ResumenProceso & { estado: ProcesoRunEstado; detalleError: string | null }
  ) {
    const { totalEncontradas: _ignorado, ...resto } = datos;
    return prisma.procesoRun.update({
      where: { id: runId },
      data: { ...resto, fechaFin: new Date() },
    });
  },

  /** Los ítems que nunca llegaron a correr cuando el run se canceló. */
  async cancelarItemsPendientes(runId: string) {
    return prisma.procesoRunItem.updateMany({
      where: { runId, estado: { in: ["PENDIENTE", "EN_PROCESO"] } },
      data: { estado: "CANCELADO", fechaFin: new Date() },
    });
  },

  /**
   * Guardarraíl entre procesos: el lock en memoria del runner no cruza a `npm run analyze`, que
   * corre en otro proceso con su propia copia del módulo. Sin esto, el CLI y el servidor pueden
   * analizar la misma licitación a la vez.
   */
  async hayRunActivo(tipo: ProcesoTipo): Promise<boolean> {
    const activo = await prisma.procesoRun.findFirst({
      where: { tipo, estado: "EN_PROCESO" },
      select: { id: true },
    });
    return activo !== null;
  },

  /**
   * Cierra los runs que quedaron EN_PROCESO porque el backend se cayó a mitad.
   *
   * Asume una sola instancia de backend, que es lo que esta app es (mono-usuario, local). Con dos,
   * el arranque de una mataría el run vivo de la otra. Por eso lo llama SOLO server.ts y nunca los
   * jobs del CLI: si `npm run analyze` barriera al arrancar, se llevaría puesto el run del servidor.
   */
  async cerrarHuerfanos(): Promise<number> {
    const { count } = await prisma.procesoRun.updateMany({
      where: { estado: "EN_PROCESO" },
      data: { estado: "INTERRUMPIDO", fechaFin: new Date() },
    });

    if (count > 0) {
      await prisma.procesoRunItem.updateMany({
        where: { estado: { in: ["PENDIENTE", "EN_PROCESO"] }, run: { estado: "INTERRUMPIDO" } },
        data: { estado: "CANCELADO", fechaFin: new Date() },
      });
    }

    return count;
  },

  async listar(pagination: Pagination, tipo?: ProcesoTipo) {
    const { skip, take } = toSkipTake(pagination);
    const where = tipo ? { tipo } : {};

    const [runs, total] = await Promise.all([
      prisma.procesoRun.findMany({ where, orderBy: { fechaInicio: "desc" }, skip, take }),
      prisma.procesoRun.count({ where }),
    ]);

    return { runs, meta: buildPaginationMeta(pagination, total) };
  },

  async obtener(id: string) {
    return prisma.procesoRun.findUnique({
      where: { id },
      include: { items: { orderBy: { orden: "asc" } } },
    });
  },
};
