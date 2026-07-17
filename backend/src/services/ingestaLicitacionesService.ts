import type { ChileCompraClient } from "../clients/chileCompraClient";
import type { EstadoFiltro, LicitacionDetalleRaw } from "../clients/chileCompraClient.types";
import { logger } from "../config/logger";
import type { licitacionRepository, LicitacionUpsertInput } from "../repositories/licitacionRepository";
import type { ingestaRunRepository } from "../repositories/ingestaRunRepository";

const FICHA_PUBLICA_BASE = "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx";

export interface IngestaFiltros {
  fecha?: Date;
  estado?: EstadoFiltro;
  codigoOrganismo?: string;
  codigoProveedor?: string;
}

export interface IngestaResumen {
  totalEncontradas: number;
  totalNuevas: number;
  totalActualizadas: number;
  totalErrores: number;
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function mapDetalleToUpsertInput(detalle: LicitacionDetalleRaw): LicitacionUpsertInput {
  return {
    codigoExterno: detalle.CodigoExterno,
    nombre: detalle.Nombre,
    codigoEstado: detalle.CodigoEstado,
    estado: detalle.Estado,
    descripcion: detalle.Descripcion,
    nombreOrganismo: detalle.Comprador?.NombreOrganismo ?? null,
    codigoOrganismo: detalle.Comprador?.CodigoOrganismo ?? null,
    rutOrganismo: detalle.Comprador?.RutUnidad ?? null,
    regionUnidad: detalle.Comprador?.RegionUnidad ?? null,
    comunaUnidad: detalle.Comprador?.ComunaUnidad ?? null,
    fechaPublicacion: toDateOrNull(detalle.Fechas?.FechaPublicacion),
    fechaCierre: toDateOrNull(detalle.Fechas?.FechaCierre),
    fechaAdjudicacion: toDateOrNull(detalle.Fechas?.FechaAdjudicacion),
    montoEstimado: detalle.MontoEstimado,
    visibilidadMonto: detalle.VisibilidadMonto,
    moneda: detalle.Moneda,
    tipo: detalle.Tipo,
    codigoTipo: detalle.CodigoTipo,
    etapas: detalle.Etapas,
    estadoEtapas: detalle.EstadoEtapas,
    subContratacion: detalle.SubContratacion ? Number(detalle.SubContratacion) : null,
    urlActaAdjudicacion: detalle.Adjudicacion?.UrlActa ?? null,
    urlFichaPublica: `${FICHA_PUBLICA_BASE}?idlicitacion=${encodeURIComponent(detalle.CodigoExterno)}`,
    rawResponse: detalle as unknown as LicitacionUpsertInput["rawResponse"],
    items: (detalle.Items?.Listado ?? []).map((item) => ({
      nombreProducto: item.NombreProducto,
      categoriaUnspsc: item.CodigoCategoria ?? null,
      cantidad: item.Cantidad ?? null,
      unidadMedida: item.UnidadMedida ?? null,
    })),
  };
}

export class IngestaLicitacionesService {
  constructor(
    private readonly chileCompraClient: ChileCompraClient,
    private readonly licitacionRepo: typeof licitacionRepository,
    private readonly ingestaRunRepo: typeof ingestaRunRepository
  ) {}

  async ingestar(filtros: IngestaFiltros, disparadoPor: "MANUAL" | "CRON" = "MANUAL"): Promise<IngestaResumen> {
    const inicio = Date.now();
    const run = await this.ingestaRunRepo.crear(
      {
        fecha: filtros.fecha?.toISOString() ?? null,
        estado: filtros.estado ?? null,
      },
      disparadoPor
    );

    const resumen: IngestaResumen = { totalEncontradas: 0, totalNuevas: 0, totalActualizadas: 0, totalErrores: 0 };

    try {
      const listado = await this.chileCompraClient.search(filtros);
      resumen.totalEncontradas = listado.length;

      const codigos = listado.map((l) => l.CodigoExterno);
      const estadosConocidos = await this.licitacionRepo.obtenerEstadosConocidos(codigos);

      const aProcesar = listado.filter((item) => {
        const estadoConocido = estadosConocidos.get(item.CodigoExterno);
        return estadoConocido === undefined || estadoConocido !== item.CodigoEstado;
      });

      logger.info(
        { ingestaRunId: run.id, encontradas: listado.length, aProcesar: aProcesar.length },
        "Listado obtenido, procesando nuevos/cambiados"
      );

      for (const item of aProcesar) {
        try {
          const detalle = await this.chileCompraClient.getDetail(item.CodigoExterno);
          if (!detalle) {
            resumen.totalErrores++;
            logger.warn({ codigoExterno: item.CodigoExterno }, "getDetail no devolvió ficha");
            continue;
          }

          const input = mapDetalleToUpsertInput(detalle);
          const { creada } = await this.licitacionRepo.upsertPorCodigoExterno(input);
          if (creada) resumen.totalNuevas++;
          else resumen.totalActualizadas++;
        } catch (err) {
          resumen.totalErrores++;
          logger.error({ err, codigoExterno: item.CodigoExterno }, "Error procesando licitación individual");
        }
      }

      await this.ingestaRunRepo.close(run.id, { ...resumen, estado: "COMPLETADO" });
      logger.info({ ingestaRunId: run.id, ...resumen, duracionMs: Date.now() - inicio }, "Ingesta completada");
      return resumen;
    } catch (err) {
      await this.ingestaRunRepo.close(run.id, {
        ...resumen,
        estado: "FALLIDO",
        detalleError: err instanceof Error ? err.message : String(err),
      });
      logger.error({ err, ingestaRunId: run.id }, "Ingesta falló");
      throw err;
    }
  }
}
