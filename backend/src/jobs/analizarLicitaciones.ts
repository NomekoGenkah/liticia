import { logger } from "../config/logger";
import { ejecutarAnalisisPendientes } from "../services/analisisRunner";

async function main() {
  logger.info({}, "Iniciando análisis de licitaciones pendientes");
  const resumen = await ejecutarAnalisisPendientes();
  logger.info({ resumen }, "Análisis de licitaciones pendientes finalizado");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Análisis de licitaciones pendientes falló");
    process.exit(1);
  });
