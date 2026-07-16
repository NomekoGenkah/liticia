import type { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import type { documentoChunkRepository } from "../repositories/documentoChunkRepository";
import type { licitacionRepository } from "../repositories/licitacionRepository";
import type { PreguntaFuente, preguntaLicitacionRepository } from "../repositories/preguntaLicitacionRepository";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors";
import { buildPreguntaPrompt, PREGUNTA_PROMPT_VERSION } from "./preguntaPrompt";

/** Ver PREFIJO_DOCUMENTO en embeddingDocumentosService: los dos lados tienen que ir prefijados. */
const PREFIJO_CONSULTA = "search_query: ";

/** Suficiente para auditar de dónde salió la cita sin duplicar el documento entero en la tabla. */
const LARGO_EXTRACTO = 200;

export class PreguntasLicitacionService {
  constructor(
    private readonly ollamaClient: OllamaClient,
    private readonly licitacionRepo: typeof licitacionRepository,
    private readonly chunkRepo: typeof documentoChunkRepository,
    private readonly preguntaRepo: typeof preguntaLicitacionRepository
  ) {}

  async responder(codigoExterno: string, pregunta: string) {
    const licitacion = await this.buscarLicitacion(codigoExterno);
    const inicio = Date.now();

    const totalChunks = await this.chunkRepo.contarPorLicitacion(licitacion.id);
    if (totalChunks === 0) {
      throw new UnprocessableEntityError(
        `La licitación ${codigoExterno} no tiene documentos indexados todavía`,
        "CHUNKS_REQUERIDOS"
      );
    }

    const [embeddingPregunta] = await this.ollamaClient.generarEmbedding([PREFIJO_CONSULTA + pregunta]);
    const chunks = await this.chunkRepo.buscarSimilares(licitacion.id, embeddingPregunta!, config.RAG_TOP_K);

    const prompt = buildPreguntaPrompt(pregunta, chunks);
    const respuesta = await this.ollamaClient.generarRespuesta(prompt);

    // Las fuentes salen de la búsqueda, no de lo que diga el modelo: así no puede citar un
    // documento que nunca estuvo en su contexto.
    const fuentes: PreguntaFuente[] = chunks.map((chunk) => ({
      documentoId: chunk.documentoId,
      nombreArchivo: chunk.nombreArchivo,
      chunkIndex: chunk.chunkIndex,
      similitud: chunk.similitud,
      extracto: chunk.contenido.slice(0, LARGO_EXTRACTO),
    }));

    const guardada = await this.preguntaRepo.crear({
      licitacionId: licitacion.id,
      pregunta,
      respuesta,
      fuentes,
      modelo: config.OLLAMA_MODEL,
      promptVersion: PREGUNTA_PROMPT_VERSION,
      duracionMs: Date.now() - inicio,
    });

    logger.info(
      { codigoExterno, fuentes: fuentes.length, duracionMs: guardada.duracionMs },
      "Pregunta sobre documentos respondida"
    );

    return guardada;
  }

  async listarHistorial(codigoExterno: string) {
    const licitacion = await this.buscarLicitacion(codigoExterno);
    return this.preguntaRepo.listarPorLicitacion(licitacion.id);
  }

  private async buscarLicitacion(codigoExterno: string) {
    const licitacion = await this.licitacionRepo.findByCodigoExterno(codigoExterno, false);
    if (!licitacion) throw new NotFoundError(`No existe la licitación ${codigoExterno}`);

    return licitacion;
  }
}
