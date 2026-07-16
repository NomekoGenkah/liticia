import { ChileCompraClient } from "../clients/chileCompraClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { apiRequestCounterRepository } from "../repositories/apiRequestCounterRepository";
import { ingestaRunRepository } from "../repositories/ingestaRunRepository";
import { licitacionRepository } from "../repositories/licitacionRepository";
import { ConflictError } from "../utils/errors";
import { IngestaLicitacionesService, type IngestaFiltros, type IngestaResumen } from "./ingestaLicitacionesService";

export interface EjecutarIngestaOptions {
  disparadoPor: "MANUAL" | "CRON";
}

let servicio: IngestaLicitacionesService | undefined;

function getIngestaService(): IngestaLicitacionesService {
  if (!servicio) {
    const client = new ChileCompraClient(
      {
        ticket: config.CHILECOMPRA_TICKET,
        apiBase: config.CHILECOMPRA_API_BASE,
        timeoutMs: config.CHILECOMPRA_REQUEST_TIMEOUT_MS,
        retryMax: config.CHILECOMPRA_RETRY_MAX,
        retryBaseDelayMs: config.CHILECOMPRA_RETRY_BASE_DELAY_MS,
        maxRequestsDia: config.CHILECOMPRA_MAX_REQUESTS_DIA,
      },
      apiRequestCounterRepository
    );

    servicio = new IngestaLicitacionesService(client, licitacionRepository, ingestaRunRepository);
  }

  return servicio;
}

let enProceso = false;

export function estaEnProceso(): boolean {
  return enProceso;
}

export async function ejecutarIngesta(
  filtros: IngestaFiltros,
  options: EjecutarIngestaOptions
): Promise<IngestaResumen> {
  if (enProceso) {
    throw new ConflictError("Ya hay una ingesta en curso, espera a que termine antes de disparar otra", "INGESTA_EN_PROCESO");
  }

  enProceso = true;
  logger.info({ filtros, disparadoPor: options.disparadoPor }, "Iniciando ingesta");

  try {
    return await getIngestaService().ingestar(filtros, options.disparadoPor);
  } finally {
    enProceso = false;
  }
}
