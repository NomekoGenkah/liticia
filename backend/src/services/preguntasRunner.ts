import { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { documentoChunkRepository } from "../repositories/documentoChunkRepository";
import { licitacionRepository } from "../repositories/licitacionRepository";
import { preguntaLicitacionRepository } from "../repositories/preguntaLicitacionRepository";
import { configuracionIaService } from "./configuracionIaService";
import { PreguntasLicitacionService } from "./preguntasLicitacionService";

let servicio: PreguntasLicitacionService | undefined;

function getPreguntasService(): PreguntasLicitacionService {
  if (!servicio) {
    const client = new OllamaClient({
      host: config.OLLAMA_URL,
      // Thunk: el RAG usa el modelo de chat elegido en Ajustes, resuelto en cada pregunta. El
      // modelo de embeddings sigue fijo (embedModel), atado a la columna vector(768).
      model: () => configuracionIaService.modeloChatActivo(),
      embedModel: config.OLLAMA_EMBED_MODEL,
      // Timeout propio: el prompt de RAG lleva miles de tokens de contexto y el prompt eval solo
      // puede tardar más que el timeout de análisis/matching.
      timeoutMs: config.OLLAMA_RAG_TIMEOUT_MS,
      ragNumCtx: config.OLLAMA_RAG_NUM_CTX,
      retryMax: config.OLLAMA_RETRY_MAX,
      retryBaseDelayMs: config.OLLAMA_RETRY_BASE_DELAY_MS,
      think: config.OLLAMA_THINK,
    });

    servicio = new PreguntasLicitacionService(
      client,
      licitacionRepository,
      documentoChunkRepository,
      preguntaLicitacionRepository
    );
  }

  return servicio;
}

/**
 * Sin lock, a diferencia de los runners de análisis/matching/embedding: esto es una petición
 * interactiva de a una, no un batch. Serializarla haría que el chat devolviera 409 mientras corre
 * un embedding, y Ollama ya serializa del lado del servidor.
 */
export async function responderPregunta(codigoExterno: string, pregunta: string) {
  return getPreguntasService().responder(codigoExterno, pregunta);
}

export async function listarPreguntas(codigoExterno: string) {
  return getPreguntasService().listarHistorial(codigoExterno);
}
