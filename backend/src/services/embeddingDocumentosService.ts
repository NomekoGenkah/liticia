import type { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import type {
  ChunkInsertInput,
  DocumentoPendienteEmbedding,
  documentoChunkRepository,
} from "../repositories/documentoChunkRepository";
import { chunkText } from "./textChunker";

export interface EmbeddingPendientesResumen {
  totalEncontrados: number;
  totalCompletados: number;
  totalFallidos: number;
  /** Documentos sin texto aprovechable (típicamente PDFs escaneados): no llegan al modelo. */
  totalOmitidos: number;
}

/**
 * nomic-embed-text es asimétrico: fue entrenado con un prefijo que declara para qué se embebe el
 * texto. Los pasajes indexados llevan `search_document: ` y las consultas `search_query: `.
 *
 * Tienen que ser consistentes entre indexado y consulta: prefijar solo uno de los dos lados
 * degrada el ranking sin ningún síntoma visible. Y el prefijo se usa únicamente para embeber — el
 * `contenido` se guarda limpio, porque es lo que después ve el LLM y el usuario.
 */
const PREFIJO_DOCUMENTO = "search_document: ";

export class EmbeddingDocumentosService {
  constructor(
    private readonly ollamaClient: OllamaClient,
    private readonly chunkRepo: typeof documentoChunkRepository
  ) {}

  async embeberPendientes(): Promise<EmbeddingPendientesResumen> {
    const pendientes = await this.chunkRepo.listarDocumentosPendientes();

    const resumen: EmbeddingPendientesResumen = {
      totalEncontrados: pendientes.length,
      totalCompletados: 0,
      totalFallidos: 0,
      totalOmitidos: 0,
    };

    for (const documento of pendientes) {
      try {
        const chunksGenerados = await this.procesar(documento);

        if (chunksGenerados === 0) resumen.totalOmitidos++;
        else resumen.totalCompletados++;
      } catch (err) {
        resumen.totalFallidos++;
        logger.error(
          { err, documentoId: documento.id, nombreArchivo: documento.nombreArchivo },
          "Embedding de documento falló dentro del batch"
        );
      }
    }

    logger.info({ ...resumen }, "Batch de embeddings de documentos pendientes finalizado");
    return resumen;
  }

  /**
   * Devuelve cuántos chunks se generaron (0 = documento sin texto aprovechable).
   *
   * A diferencia de análisis/matching, un fallo no se persiste: el chunk no tiene columna de
   * estado, y no hace falta — la ausencia de chunks ya *es* el estado de fallo, porque es el mismo
   * predicado que define "pendiente". El documento se reintenta solo en la próxima corrida.
   */
  private async procesar(documento: DocumentoPendienteEmbedding): Promise<number> {
    const inicio = Date.now();
    const contenidos = chunkText(documento.textoExtraido);

    if (contenidos.length === 0) {
      logger.warn(
        { documentoId: documento.id, nombreArchivo: documento.nombreArchivo },
        "Documento sin texto aprovechable: se omite del embedding (¿PDF escaneado?)"
      );
      return 0;
    }

    const chunks: ChunkInsertInput[] = [];

    for (let i = 0; i < contenidos.length; i += config.OLLAMA_EMBED_BATCH_SIZE) {
      const lote = contenidos.slice(i, i + config.OLLAMA_EMBED_BATCH_SIZE);
      const embeddings = await this.ollamaClient.generarEmbedding(lote.map((texto) => PREFIJO_DOCUMENTO + texto));

      lote.forEach((contenido, indiceEnLote) => {
        chunks.push({
          documentoId: documento.id,
          licitacionId: documento.licitacionId,
          contenido,
          chunkIndex: i + indiceEnLote,
          embedding: embeddings[indiceEnLote]!,
          modelo: config.OLLAMA_EMBED_MODEL,
        });
      });
    }

    await this.chunkRepo.reemplazarChunksDeDocumento(documento.id, chunks);

    logger.info(
      {
        documentoId: documento.id,
        nombreArchivo: documento.nombreArchivo,
        codigoExterno: documento.codigoExterno,
        chunks: chunks.length,
        duracionMs: Date.now() - inicio,
      },
      "Embedding de documento completado"
    );

    return chunks.length;
  }
}
