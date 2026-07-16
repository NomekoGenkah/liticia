import { logger } from "../config/logger";
import { ejecutarMatchingPendientes } from "../services/matchingRunner";

async function main() {
  logger.info({}, "Iniciando matching de licitaciones pendientes");
  const resumen = await ejecutarMatchingPendientes();
  logger.info({ resumen }, "Matching de licitaciones pendientes finalizado");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Matching de licitaciones pendientes falló");
    process.exit(1);
  });
