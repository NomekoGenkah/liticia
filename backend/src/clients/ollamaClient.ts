import { Ollama } from "ollama";
import { z } from "zod";
import { OllamaApiError } from "../utils/errors";
import { withRetry } from "../utils/httpRetry";
import type { AnalisisLlmResultado, MatchingLlmResultado } from "./ollamaClient.types";

interface OllamaClientOptions {
  host: string;
  model: string;
  timeoutMs: number;
  retryMax: number;
  retryBaseDelayMs: number;
  think: boolean;
  /** Modelo de embeddings, distinto del de chat. Solo lo usa generarEmbedding(). */
  embedModel?: string;
  /** Ventana de contexto para generarRespuesta(). Ver el comentario de num_ctx más abajo. */
  ragNumCtx?: number;
}

export interface AnalisisPrompt {
  system: string;
  user: string;
}

export interface MatchingPrompt {
  system: string;
  user: string;
}

export interface PreguntaPrompt {
  system: string;
  user: string;
}

/** Atada a la columna `vector(768)` de LicitacionDocumentoChunk: cambiarla exige una migración. */
export const EMBEDDING_DIMENSIONS = 768;

const ANALISIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    resumenEjecutivo: { type: "string" },
    puntosClave: { type: "array", items: { type: "string" } },
    palabrasClave: { type: "array", items: { type: "string" } },
    nivelComplejidad: { type: "string", enum: ["baja", "media", "alta"] },
  },
  required: ["resumenEjecutivo", "puntosClave", "palabrasClave", "nivelComplejidad"],
} as const;

const analisisResultadoSchema = z.object({
  resumenEjecutivo: z.string(),
  puntosClave: z.array(z.string()),
  palabrasClave: z.array(z.string()),
  nivelComplejidad: z.enum(["baja", "media", "alta"]),
});

const MATCHING_JSON_SCHEMA = {
  type: "object",
  properties: {
    puntaje: { type: "integer", minimum: 0, maximum: 100 },
    recomendacion: { type: "string", enum: ["si", "no", "tal_vez"] },
    justificacion: { type: "string" },
  },
  required: ["puntaje", "recomendacion", "justificacion"],
} as const;

const matchingResultadoSchema = z.object({
  puntaje: z.number().int().min(0).max(100),
  recomendacion: z.enum(["si", "no", "tal_vez"]),
  justificacion: z.string(),
});

const THINK_BLOCK_PATTERN = /^\s*<think>[\s\S]*?<\/think>\s*/i;
const CODE_FENCE_PATTERN = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;

function stripThinkAndFences(content: string): string {
  let cleaned = content.replace(THINK_BLOCK_PATTERN, "").trim();

  const fenceMatch = cleaned.match(CODE_FENCE_PATTERN);
  if (fenceMatch?.[1] !== undefined) cleaned = fenceMatch[1].trim();

  return cleaned;
}

/** Exportada para poder testearla sin mockear el paquete `ollama`. */
export function parseAnalisisResponse(content: string): AnalisisLlmResultado {
  const cleaned = stripThinkAndFences(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new OllamaApiError(`Respuesta del modelo no es JSON válido: ${cleaned.slice(0, 200)}`);
  }

  const result = analisisResultadoSchema.safeParse(parsed);
  if (!result.success) {
    throw new OllamaApiError(`Respuesta del modelo no cumple el schema esperado: ${result.error.message}`);
  }

  return result.data;
}

/** Exportada para poder testearla sin mockear el paquete `ollama`. */
export function parseMatchingResponse(content: string): MatchingLlmResultado {
  const cleaned = stripThinkAndFences(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new OllamaApiError(`Respuesta del modelo no es JSON válido: ${cleaned.slice(0, 200)}`);
  }

  const result = matchingResultadoSchema.safeParse(parsed);
  if (!result.success) {
    throw new OllamaApiError(`Respuesta del modelo no cumple el schema esperado: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Exportada para poder testearla sin mockear el paquete `ollama`.
 *
 * A diferencia de las respuestas de análisis/matching, acá no se quitan los fences de Markdown:
 * esperamos prosa, y una respuesta que legítimamente incluya un bloque ``` se corrompería.
 */
export function parseRespuestaTexto(content: string): string {
  const limpio = content.replace(THINK_BLOCK_PATTERN, "").trim();

  // Quitar el <think> importa más acá que en el camino JSON: allá una fuga rompe JSON.parse de
  // forma ruidosa, acá se guardaría el razonamiento del modelo y se le mostraría al usuario.
  if (limpio.length === 0) {
    throw new OllamaApiError("El modelo devolvió una respuesta vacía");
  }

  return limpio;
}

/**
 * Exportada para poder testearla sin mockear el paquete `ollama`.
 *
 * Convierte un OLLAMA_EMBED_MODEL de dimensión equivocada en un error explícito acá, en vez de un
 * INSERT que revienta más tarde con un error críptico de Postgres.
 */
export function validarEmbeddings(embeddings: unknown, esperados: number): number[][] {
  if (!Array.isArray(embeddings) || embeddings.length !== esperados) {
    throw new OllamaApiError(
      `El modelo devolvió ${Array.isArray(embeddings) ? embeddings.length : 0} vectores, se esperaban ${esperados}`
    );
  }

  for (const vector of embeddings) {
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
      throw new OllamaApiError(
        `El modelo devolvió vectores de ${Array.isArray(vector) ? vector.length : 0} dimensiones, se esperaban ${EMBEDDING_DIMENSIONS}`
      );
    }

    if (!vector.every((componente) => typeof componente === "number" && Number.isFinite(componente))) {
      throw new OllamaApiError("El modelo devolvió un vector con componentes no numéricos");
    }
  }

  return embeddings as number[][];
}

export class OllamaClient {
  private readonly client: Ollama;

  constructor(private readonly options: OllamaClientOptions) {
    const timeoutFetch: typeof fetch = (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });

    this.client = new Ollama({ host: options.host, fetch: timeoutFetch });
  }

  async generarAnalisis(prompt: AnalisisPrompt): Promise<AnalisisLlmResultado> {
    return withRetry(
      async () => {
        let response;
        try {
          response = await this.client.chat({
            model: this.options.model,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            format: ANALISIS_JSON_SCHEMA,
            think: this.options.think,
            stream: false,
            options: { temperature: 0.2 },
          });
        } catch (err) {
          throw new OllamaApiError(
            `Falló la llamada a Ollama (${this.options.host}, modelo ${this.options.model}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }

        return parseAnalisisResponse(response.message.content);
      },
      {
        retries: this.options.retryMax,
        baseDelayMs: this.options.retryBaseDelayMs,
        context: "ollamaClient.generarAnalisis",
      }
    );
  }

  async generarMatching(prompt: MatchingPrompt): Promise<MatchingLlmResultado> {
    return withRetry(
      async () => {
        let response;
        try {
          response = await this.client.chat({
            model: this.options.model,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            format: MATCHING_JSON_SCHEMA,
            think: this.options.think,
            stream: false,
            options: { temperature: 0.2 },
          });
        } catch (err) {
          throw new OllamaApiError(
            `Falló la llamada a Ollama (${this.options.host}, modelo ${this.options.model}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }

        return parseMatchingResponse(response.message.content);
      },
      {
        retries: this.options.retryMax,
        baseDelayMs: this.options.retryBaseDelayMs,
        context: "ollamaClient.generarMatching",
      }
    );
  }

  /**
   * Embebe varios textos en una sola llamada. El llamador decide el tamaño del lote; acá no hay
   * política de sub-lotes, solo la llamada.
   */
  async generarEmbedding(textos: string[]): Promise<number[][]> {
    const model = this.options.embedModel;
    if (!model) {
      throw new OllamaApiError("Este OllamaClient se construyó sin embedModel: no puede generar embeddings");
    }

    if (textos.length === 0) return [];

    return withRetry(
      async () => {
        let response;
        try {
          response = await this.client.embed({
            model,
            input: textos,
            // El default de Ollama es `true`: recortaría en silencio cualquier texto que exceda la
            // ventana del modelo, guardando un embedding que no representa al chunk completo. Con
            // `false` falla ruidosamente, que es lo que queremos: significaría un bug del chunker.
            truncate: false,
          });
        } catch (err) {
          throw new OllamaApiError(
            `Falló la llamada de embeddings a Ollama (${this.options.host}, modelo ${model}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }

        return validarEmbeddings(response.embeddings, textos.length);
      },
      {
        retries: this.options.retryMax,
        baseDelayMs: this.options.retryBaseDelayMs,
        context: "ollamaClient.generarEmbedding",
      }
    );
  }

  /**
   * Responde una pregunta a partir de los fragmentos que le pasa el prompt.
   *
   * Sin `format`: la salida es prosa, y un JSON schema obligaría al modelo a escapar cada comilla
   * y salto de línea — una sola string mal cerrada tira a la basura toda la generación. Tampoco
   * hace falta que el modelo cite sus fuentes: las sabemos por los chunks que recuperamos.
   */
  async generarRespuesta(prompt: PreguntaPrompt): Promise<string> {
    return withRetry(
      async () => {
        let response;
        try {
          response = await this.client.chat({
            model: this.options.model,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            think: this.options.think,
            stream: false,
            options: {
              temperature: 0.2,
              // Explícito y no negociable: Ollama trunca el prompt a num_ctx (default 4096)
              // descartando los tokens más viejos. Este prompt lleva varios miles de tokens de
              // contexto, así que con el default se perdería el system prompt y los fragmentos más
              // relevantes (van ordenados por similitud), y el modelo respondería genérico o
              // inventaría, sin un solo error en los logs.
              num_ctx: this.options.ragNumCtx,
            },
          });
        } catch (err) {
          throw new OllamaApiError(
            `Falló la llamada a Ollama (${this.options.host}, modelo ${this.options.model}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }

        return parseRespuestaTexto(response.message.content);
      },
      {
        retries: this.options.retryMax,
        baseDelayMs: this.options.retryBaseDelayMs,
        context: "ollamaClient.generarRespuesta",
      }
    );
  }
}
