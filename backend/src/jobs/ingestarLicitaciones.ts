import { ChileCompraClient } from "../clients/chileCompraClient";
import type { EstadoFiltro } from "../clients/chileCompraClient.types";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { apiRequestCounterRepository } from "../repositories/apiRequestCounterRepository";
import { ingestaRunRepository } from "../repositories/ingestaRunRepository";
import { licitacionRepository } from "../repositories/licitacionRepository";
import { fromChileCompraDate } from "../utils/dateFormat";
import { IngestaLicitacionesService } from "../services/ingestaLicitacionesService";

/** Uso: npm run ingest -- --fecha=DDMMYYYY --estado=activas --codigoOrganismo=7248 */
function parseArgs(
  argv: string[]
): { fecha?: Date; estado?: EstadoFiltro; codigoOrganismo?: string; codigoProveedor?: string } {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match?.[1] && match[2] !== undefined) args[match[1]] = match[2];
  }

  return {
    fecha: args.fecha ? fromChileCompraDate(args.fecha) : undefined,
    estado: (args.estado as EstadoFiltro) ?? "activas",
    codigoOrganismo: args.codigoOrganismo,
    codigoProveedor: args.codigoProveedor,
  };
}

async function main() {
  const filtros = parseArgs(process.argv.slice(2));

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

  const service = new IngestaLicitacionesService(client, licitacionRepository, ingestaRunRepository);

  logger.info({ filtros }, "Iniciando ingesta manual");
  const resumen = await service.ingestar(filtros);
  logger.info({ resumen }, "Ingesta manual finalizada");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Ingesta manual falló");
    process.exit(1);
  });
