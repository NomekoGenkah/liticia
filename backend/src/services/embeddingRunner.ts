import { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { documentoChunkRepository } from "../repositories/documentoChunkRepository";
import { ConflictError } from "../utils/errors";
import { EmbeddingDocumentosService, type EmbeddingPendientesResumen } from "./embeddingDocumentosService";

let servicio: EmbeddingDocumentosService | undefined;

function getEmbeddingService(): EmbeddingDocumentosService {
  if (!servicio) {
    const client = new OllamaClient({
      host: config.OLLAMA_URL,
      model: config.OLLAMA_MODEL,
      embedModel: config.OLLAMA_EMBED_MODEL,
      timeoutMs: config.OLLAMA_REQUEST_TIMEOUT_MS,
      retryMax: config.OLLAMA_RETRY_MAX,
      retryBaseDelayMs: config.OLLAMA_RETRY_BASE_DELAY_MS,
      think: config.OLLAMA_THINK,
    });

    servicio = new EmbeddingDocumentosService(client, documentoChunkRepository);
  }

  return servicio;
}

let enProceso = false;

export function estaEmbeddingEnProceso(): boolean {
  return enProceso;
}

function tomarLock(): void {
  if (enProceso) {
    throw new ConflictError(
      "Ya hay una generación de embeddings en curso, espera a que termine antes de disparar otra",
      "EMBEDDING_EN_PROCESO"
    );
  }
  enProceso = true;
}

/** Dispara el batch en segundo plano y retorna de inmediato. Usado por el endpoint HTTP async. */
export function iniciarEmbeddingPendientes(): void {
  tomarLock();
  logger.info({}, "Iniciando embedding de documentos pendientes (background)");

  getEmbeddingService()
    .embeberPendientes()
    .then((resumen) => logger.info({ ...resumen }, "Batch de embeddings finalizado"))
    .catch((err) => logger.error({ err }, "Batch de embeddings falló"))
    .finally(() => {
      enProceso = false;
    });
}

/** Ejecuta el batch y espera el resultado completo. Usado por el script CLI. */
export async function ejecutarEmbeddingPendientes(): Promise<EmbeddingPendientesResumen> {
  tomarLock();
  try {
    return await getEmbeddingService().embeberPendientes();
  } finally {
    enProceso = false;
  }
}
