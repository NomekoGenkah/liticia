import { OllamaClient } from "../../clients/ollamaClient";
import { config } from "../../config/env";
import { analisisLicitacionRepository, type LicitacionPendiente } from "../../repositories/analisisLicitacionRepository";
import {
  matchingLicitacionRepository,
  type LicitacionParaMatchingPendiente,
} from "../../repositories/matchingLicitacionRepository";
import {
  documentoChunkRepository,
  type DocumentoPendienteEmbedding,
} from "../../repositories/documentoChunkRepository";
import { perfilEmpresaRepository } from "../../repositories/perfilEmpresaRepository";
import { procesoRunRepository } from "../../repositories/procesoRunRepository";
import type { ProcesoTipo } from "../../types/procesos";
import { NotFoundError } from "../../utils/errors";
import { AnalisisLicitacionesService } from "../analisisLicitacionesService";
import { EmbeddingDocumentosService } from "../embeddingDocumentosService";
import { MatchingLicitacionesService, type ContextoMatching } from "../matchingLicitacionesService";
import { ProcesoRunner } from "./procesoRunner";

/** El cliente de chat: análisis y matching comparten modelo, timeouts y política de reintentos. */
function clienteChat(): OllamaClient {
  return new OllamaClient({
    host: config.OLLAMA_URL,
    model: config.OLLAMA_MODEL,
    timeoutMs: config.OLLAMA_REQUEST_TIMEOUT_MS,
    streamIdleTimeoutMs: config.OLLAMA_STREAM_IDLE_TIMEOUT_MS,
    streamHardCapMs: config.OLLAMA_STREAM_HARD_CAP_MS,
    retryMax: config.OLLAMA_RETRY_MAX,
    retryBaseDelayMs: config.OLLAMA_RETRY_BASE_DELAY_MS,
    think: config.OLLAMA_THINK,
  });
}

function construirRunners() {
  const analisis = new AnalisisLicitacionesService(clienteChat(), analisisLicitacionRepository, perfilEmpresaRepository);
  const matching = new MatchingLicitacionesService(clienteChat(), perfilEmpresaRepository, matchingLicitacionRepository);
  const embedding = new EmbeddingDocumentosService(
    new OllamaClient({
      host: config.OLLAMA_URL,
      model: config.OLLAMA_MODEL,
      embedModel: config.OLLAMA_EMBED_MODEL,
      timeoutMs: config.OLLAMA_REQUEST_TIMEOUT_MS,
      retryMax: config.OLLAMA_RETRY_MAX,
      retryBaseDelayMs: config.OLLAMA_RETRY_BASE_DELAY_MS,
      think: config.OLLAMA_THINK,
    }),
    documentoChunkRepository
  );

  return {
    ANALISIS: new ProcesoRunner<LicitacionPendiente, void>(
      {
        tipo: "ANALISIS",
        modelo: () => config.OLLAMA_MODEL,
        planificar: (seleccion) => analisis.planificar(seleccion),
        describir: (l) => ({
          objetoId: l.id,
          etiqueta: l.codigoExterno,
          titulo: l.nombre,
          subtitulo: l.nombreOrganismo,
        }),
        procesar: async (l, _ctx, opts) => {
          await analisis.procesar(l, opts);
          return "COMPLETADO";
        },
      },
      procesoRunRepository
    ),

    MATCHING: new ProcesoRunner<LicitacionParaMatchingPendiente, ContextoMatching>(
      {
        tipo: "MATCHING",
        modelo: () => config.OLLAMA_MODEL,
        planificar: (seleccion) => matching.planificar(seleccion),
        describir: (l) => ({
          objetoId: l.id,
          etiqueta: l.codigoExterno,
          titulo: l.nombre,
          subtitulo: l.nombreOrganismo,
        }),
        procesar: async (l, ctx, opts) => {
          await matching.procesar(l, ctx, opts);
          return "COMPLETADO";
        },
      },
      procesoRunRepository
    ),

    EMBEDDING: new ProcesoRunner<DocumentoPendienteEmbedding, void>(
      {
        tipo: "EMBEDDING",
        modelo: () => config.OLLAMA_EMBED_MODEL,
        planificar: (seleccion) => embedding.planificar(seleccion),
        describir: (d) => ({
          objetoId: d.id,
          etiqueta: d.nombreArchivo,
          titulo: d.codigoExterno,
          subtitulo: null,
        }),
        procesar: (d, ctx, opts) => embedding.procesar(d, ctx, opts),
      },
      procesoRunRepository
    ),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runners: ReturnType<typeof construirRunners> | undefined;

/**
 * Memoización perezosa, y no es cosmética: config/env.ts hace process.exit(1) al importarse si el
 * .env está mal, y los tests importan las rutas. Construir los runners en el top level del módulo
 * mataría el proceso de test al cargar el archivo.
 */
export function getRunner<T extends ProcesoTipo>(tipo: T): ReturnType<typeof construirRunners>[T] {
  runners ??= construirRunners();
  return runners[tipo];
}

/** Los slugs de la URL, que son en minúscula y en plural donde corresponde. */
const SLUGS: Record<string, ProcesoTipo> = {
  analisis: "ANALISIS",
  matching: "MATCHING",
  embeddings: "EMBEDDING",
};

export function runnerPorSlug(slug: string) {
  const tipo = SLUGS[slug];
  if (!tipo) {
    throw new NotFoundError(
      `Tipo de proceso desconocido: ${slug}. Los válidos son ${Object.keys(SLUGS).join(", ")}`,
      "TIPO_PROCESO_INVALIDO"
    );
  }
  return getRunner(tipo);
}
