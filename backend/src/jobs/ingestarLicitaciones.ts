import type { EstadoFiltro } from "../clients/chileCompraClient.types";
import { logger } from "../config/logger";
import { ejecutarIngesta } from "../services/ingestaRunner";
import { fromChileCompraDate } from "../utils/dateFormat";

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

  logger.info({ filtros }, "Iniciando ingesta manual");
  const resumen = await ejecutarIngesta(filtros, { disparadoPor: "MANUAL" });
  logger.info({ resumen }, "Ingesta manual finalizada");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Ingesta manual falló");
    process.exit(1);
  });
