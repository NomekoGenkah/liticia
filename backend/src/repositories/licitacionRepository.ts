import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

export interface LicitacionItemInput {
  nombreProducto: string;
  categoriaUnspsc: string | null;
  cantidad: number | null;
  unidadMedida: string | null;
}

export interface LicitacionUpsertInput {
  codigoExterno: string;
  nombre: string;
  codigoEstado: number;
  estado: string;
  descripcion: string | null;
  nombreOrganismo: string | null;
  codigoOrganismo: string | null;
  rutOrganismo: string | null;
  regionUnidad: string | null;
  comunaUnidad: string | null;
  fechaPublicacion: Date | null;
  fechaCierre: Date | null;
  fechaAdjudicacion: Date | null;
  montoEstimado: number | null;
  visibilidadMonto: number | null;
  moneda: string | null;
  tipo: string | null;
  codigoTipo: number | null;
  etapas: number | null;
  estadoEtapas: string | null;
  subContratacion: number | null;
  urlActaAdjudicacion: string | null;
  urlFichaPublica: string;
  rawResponse: Prisma.InputJsonValue;
  items: LicitacionItemInput[];
}

export interface LicitacionFiltros {
  estado?: string;
  codigoOrganismo?: string;
  fechaCierreDesde?: Date;
  fechaCierreHasta?: Date;
  recomendacion?: "SI" | "NO" | "TAL_VEZ";
}

export interface OrderBy {
  field: "fechaPublicacion" | "fechaCierre" | "montoEstimado" | "puntaje";
  direction: "asc" | "desc";
}

export const licitacionRepository = {
  /** Códigos ya vistos, con su CodigoEstado conocido — para que el servicio decida qué re-consultar. */
  async obtenerEstadosConocidos(codigosExternos: string[]): Promise<Map<string, number>> {
    if (codigosExternos.length === 0) return new Map();

    const filas = await prisma.licitacion.findMany({
      where: { codigoExterno: { in: codigosExternos } },
      select: { codigoExterno: true, ultimoEstadoConocido: true, codigoEstado: true },
    });

    return new Map(filas.map((f) => [f.codigoExterno, f.ultimoEstadoConocido ?? f.codigoEstado]));
  },

  async upsertPorCodigoExterno(input: LicitacionUpsertInput): Promise<{ creada: boolean }> {
    const existente = await prisma.licitacion.findUnique({
      where: { codigoExterno: input.codigoExterno },
      select: { id: true },
    });

    const scalarData = {
      nombre: input.nombre,
      codigoEstado: input.codigoEstado,
      estado: input.estado,
      descripcion: input.descripcion,
      nombreOrganismo: input.nombreOrganismo,
      codigoOrganismo: input.codigoOrganismo,
      rutOrganismo: input.rutOrganismo,
      regionUnidad: input.regionUnidad,
      comunaUnidad: input.comunaUnidad,
      fechaPublicacion: input.fechaPublicacion,
      fechaCierre: input.fechaCierre,
      fechaAdjudicacion: input.fechaAdjudicacion,
      montoEstimado: input.montoEstimado,
      visibilidadMonto: input.visibilidadMonto,
      moneda: input.moneda,
      tipo: input.tipo,
      codigoTipo: input.codigoTipo,
      etapas: input.etapas,
      estadoEtapas: input.estadoEtapas,
      subContratacion: input.subContratacion,
      urlActaAdjudicacion: input.urlActaAdjudicacion,
      urlFichaPublica: input.urlFichaPublica,
      rawResponse: input.rawResponse,
      fechaDetalleObtenido: new Date(),
      ultimoEstadoConocido: input.codigoEstado,
    };

    await prisma.$transaction(async (tx) => {
      const licitacion = await tx.licitacion.upsert({
        where: { codigoExterno: input.codigoExterno },
        create: { codigoExterno: input.codigoExterno, ...scalarData },
        update: scalarData,
      });

      await tx.licitacionItem.deleteMany({ where: { licitacionId: licitacion.id } });
      if (input.items.length > 0) {
        await tx.licitacionItem.createMany({
          data: input.items.map((item) => ({ ...item, licitacionId: licitacion.id })),
        });
      }
    });

    return { creada: !existente };
  },

  async findMany(filtros: LicitacionFiltros, orderBy: OrderBy, skip: number, take: number) {
    const where: Prisma.LicitacionWhereInput = {
      ...(filtros.estado ? { estado: { equals: filtros.estado, mode: "insensitive" } } : {}),
      ...(filtros.codigoOrganismo ? { codigoOrganismo: filtros.codigoOrganismo } : {}),
      ...(filtros.fechaCierreDesde || filtros.fechaCierreHasta
        ? {
            fechaCierre: {
              ...(filtros.fechaCierreDesde ? { gte: filtros.fechaCierreDesde } : {}),
              ...(filtros.fechaCierreHasta ? { lte: filtros.fechaCierreHasta } : {}),
            },
          }
        : {}),
      ...(filtros.recomendacion ? { matching: { recomendacion: filtros.recomendacion } } : {}),
    };

    const prismaOrderBy: Prisma.LicitacionOrderByWithRelationInput =
      orderBy.field === "puntaje"
        ? { matching: { puntaje: orderBy.direction } }
        : { [orderBy.field]: orderBy.direction };

    const [data, total] = await prisma.$transaction([
      prisma.licitacion.findMany({
        where,
        orderBy: prismaOrderBy,
        skip,
        take,
        omit: { rawResponse: true },
        include: {
          analisis: { select: { estado: true, nivelComplejidad: true } },
          matching: { select: { estado: true, puntaje: true, recomendacion: true } },
        },
      }),
      prisma.licitacion.count({ where }),
    ]);

    return { data, total };
  },

  async findByCodigoExterno(codigoExterno: string, includeRaw: boolean) {
    return prisma.licitacion.findUnique({
      where: { codigoExterno },
      include: { items: true, analisis: true, matching: true },
      omit: includeRaw ? undefined : { rawResponse: true },
    });
  },
};
