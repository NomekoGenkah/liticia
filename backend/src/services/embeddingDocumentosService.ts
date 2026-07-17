import type { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import type {
  ChunkInsertInput,
  DocumentoPendienteEmbedding,
  documentoChunkRepository,
} from "../repositories/documentoChunkRepository";
import type { OpcionesItem, PlanProceso, SeleccionProceso } from "../types/procesos";
import { NotFoundError, ProcesoCanceladoError } from "../utils/errors";
import { chunkText } from "./textChunker";

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

  /** Puro: no escribe nada. Sirve tanto para arrancar un run como para la vista previa. */
  async planificar(seleccion: SeleccionProceso): Promise<PlanProceso<DocumentoPendienteEmbedding, void>> {
    if (seleccion.modo === "IDS") {
      const items = await this.chunkRepo.listarDocumentosPorIds(seleccion.ids);

      const faltantes = seleccion.ids.filter((id) => !items.some((i) => i.id === id));
      if (faltantes.length > 0) {
        throw new NotFoundError(`No existen los documentos ${faltantes.join(", ")}`, "DOCUMENTO_NO_ENCONTRADO");
      }

      return { items, omitidos: [], ctx: undefined, parametros: { modo: "IDS", ids: seleccion.ids } };
    }

    const items = await this.chunkRepo.listarDocumentosPendientes();
    return { items, omitidos: [], ctx: undefined, parametros: { modo: "PENDIENTES" } };
  }

  /**
   * Indexa un documento. "OMITIDO" = sin texto aprovechable (típicamente un PDF escaneado).
   *
   * A diferencia de análisis/matching, un fallo no se persiste: el chunk no tiene columna de
   * estado, y no hace falta — la ausencia de chunks ya *es* el estado de fallo, porque es el mismo
   * predicado que define "pendiente". El documento se reintenta solo en la próxima corrida.
   */
  async procesar(
    documento: DocumentoPendienteEmbedding,
    _ctx: void,
    opts: OpcionesItem
  ): Promise<"COMPLETADO" | "OMITIDO"> {
    const inicio = Date.now();
    const contenidos = chunkText(documento.textoExtraido);

    if (contenidos.length === 0) {
      logger.warn(
        { documentoId: documento.id, nombreArchivo: documento.nombreArchivo },
        "Documento sin texto aprovechable: se omite del embedding (¿PDF escaneado?)"
      );
      return "OMITIDO";
    }

    const chunks: ChunkInsertInput[] = [];

    for (let i = 0; i < contenidos.length; i += config.OLLAMA_EMBED_BATCH_SIZE) {
      // El único punto de cancelación que tiene un documento: generarEmbedding no acepta signal
      // (la lib no lo soporta para /api/embed), así que se corta entre lotes. Un documento largo
      // son varios lotes de segundos, no la generación de minutos de análisis/matching.
      if (opts.signal.aborted) throw new ProcesoCanceladoError();

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

    return "COMPLETADO";
  }
}
