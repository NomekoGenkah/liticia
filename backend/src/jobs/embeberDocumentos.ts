import { logger } from "../config/logger";
import { ejecutarEmbeddingPendientes } from "../services/embeddingRunner";

async function main() {
  logger.info({}, "Iniciando embedding de documentos pendientes");
  const resumen = await ejecutarEmbeddingPendientes();
  logger.info({ resumen }, "Embedding de documentos pendientes finalizado");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Embedding de documentos pendientes falló");
    process.exit(1);
  });
