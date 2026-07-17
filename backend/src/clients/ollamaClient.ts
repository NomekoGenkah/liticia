import { type AbortableAsyncIterator, type ChatResponse, Ollama } from "ollama";
import { z } from "zod";
import { OllamaApiError, ProcesoCanceladoError } from "../utils/errors";
import { withRetry } from "../utils/httpRetry";
import type { AnalisisLlmResultado, MatchingLlmResultado } from "./ollamaClient.types";

interface OllamaClientOptions {
  host: string;
  model: string;
  /** Tope de pared de las llamadas sin streaming (embeddings, RAG). */
  timeoutMs: number;
  retryMax: number;
  retryBaseDelayMs: number;
  think: boolean;
  /** Máximo hueco entre tokens en una generación con streaming. */
  streamIdleTimeoutMs?: number;
  /** Tope de pared del streaming, red de seguridad del watchdog de inactividad. */
  streamHardCapMs?: number;
  /** Modelo de embeddings, distinto del de chat. Solo lo usa generarEmbedding(). */
  embedModel?: string;
  /** Ventana de contexto para generarRespuesta(). Ver el comentario de num_ctx más abajo. */
  ragNumCtx?: number;
}

/**
 * De qué parte de la generación viene el texto. Los modelos con `think` emiten su razonamiento en
 * un campo aparte del contenido, y mezclarlos le mostraría al usuario el borrador como si fuera la
 * respuesta.
 */
export type CanalToken = "respuesta" | "pensamiento";

export interface OpcionesGeneracion {
  /** Cancelación externa. Aborta la request HTTP; el llamador recibe ProcesoCanceladoError. */
  signal?: AbortSignal;
  /** Se llama por chunk, sin agrupar: agrupar es política de transporte, no de este cliente. */
  onToken?: (texto: string, canal: CanalToken) => void;
  /** Se llama si un intento falla y se va a reintentar, para descartar la salida parcial del anterior. */
  onReintento?: (intento: number) => void;
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
    /**
     * Compone los signals en vez de pisarlos, y de eso cuelga toda la cancelación.
     *
     * El paquete `ollama` crea un AbortController propio SOLO para las requests con stream:true
     * (processStreamableRequest) y pasa su signal acá como `init.signal`; es lo único que hace que
     * AbortableAsyncIterator.abort() llegue al socket. La versión anterior de este fetch lo
     * descartaba, así que abortar no tenía ningún efecto.
     *
     * Y por lo mismo `init.signal` sirve de discriminador: si está, es una request con streaming.
     * Ahí el timeout real es el watchdog de inactividad del loop y acá solo queda un tope de
     * seguridad; sin él, es una llamada común y el tope de pared de siempre aplica tal cual.
     */
    const fetchConTimeout: typeof fetch = (input, init) => {
      const esStream = init?.signal != null;
      const timeout = AbortSignal.timeout(
        esStream ? (options.streamHardCapMs ?? options.timeoutMs) : options.timeoutMs
      );
      const signal = init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout;
      return fetch(input, { ...init, signal });
    };

    this.client = new Ollama({ host: options.host, fetch: fetchConTimeout });
  }

  /**
   * Genera con streaming y devuelve el contenido completo acumulado.
   *
   * El streaming acá no es solo para mostrar el progreso: es el único camino por el que la
   * cancelación puede existir (ver el comentario del constructor). Que el parseo siga recibiendo el
   * string entero es deliberado — la salida solo es válida completa, y `format` (el JSON schema) se
   * aplica en el sampler, así que sigue vigente token a token.
   */
  private async chatStreaming(
    prompt: { system: string; user: string },
    format: object,
    opts: OpcionesGeneracion
  ): Promise<string> {
    // La cancelación externa no llega sola al iterador: el AbortController que la lib crea es suyo,
    // y abort() es la única puerta para alcanzarlo.
    let iterador: AbortableAsyncIterator<ChatResponse> | undefined;
    const abortar = () => iterador?.abort();

    // Watchdog de inactividad. Reemplaza al tope de pared, que con streaming cortaría una
    // generación que está saliendo bien solo por ser larga.
    let watchdog: NodeJS.Timeout | undefined;
    const patear = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(
        () => abortar(),
        this.options.streamIdleTimeoutMs ?? this.options.timeoutMs
      );
    };

    let contenido = "";
    try {
      // La llamada va DENTRO del try: si Ollama no está levantado, el error tiene que salir como
      // OllamaApiError igual que el resto, no crudo.
      iterador = await this.client.chat({
        model: this.options.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        format,
        think: this.options.think,
        stream: true,
        options: { temperature: 0.2 },
      });

      // El signal pudo abortarse mientras se establecía la conexión, cuando todavía no había
      // iterador que abortar. Sin este chequeo, ese listener quedaría sin efecto y la generación
      // correría entera pese a estar cancelada.
      if (opts.signal?.aborted) throw new ProcesoCanceladoError();
      opts.signal?.addEventListener("abort", abortar, { once: true });

      patear();
      for await (const chunk of iterador) {
        patear();
        if (chunk.message.thinking) opts.onToken?.(chunk.message.thinking, "pensamiento");
        if (chunk.message.content) {
          contenido += chunk.message.content;
          opts.onToken?.(chunk.message.content, "respuesta");
        }
      }

      // Un abort puede cortar el iterador en el borde de un chunk, y ahí el for-await termina
      // limpio en vez de lanzar. Sin este chequeo devolveríamos el contenido parcial, el parseo
      // fallaría por JSON incompleto, y withRetry reintentaría lo que el usuario acaba de cancelar.
      if (opts.signal?.aborted) throw new ProcesoCanceladoError();

      return contenido;
    } catch (err) {
      // Se traduce por el estado del signal, no olfateando el error: iterador.abort() produce un
      // AbortError idéntico al del watchdog, así que el error en sí no distingue "canceló el
      // usuario" de "Ollama se colgó". Cubre también el ProcesoCanceladoError de más arriba.
      if (opts.signal?.aborted) throw new ProcesoCanceladoError();
      throw new OllamaApiError(
        `Falló la llamada a Ollama (${this.options.host}, modelo ${this.options.model}): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      clearTimeout(watchdog);
      opts.signal?.removeEventListener("abort", abortar);
    }
  }

  /** Reintentar lo que el usuario acaba de cancelar es exactamente lo contrario de cancelar. */
  private opcionesRetry(context: string, opts: OpcionesGeneracion) {
    return {
      retries: this.options.retryMax,
      baseDelayMs: this.options.retryBaseDelayMs,
      context,
      esRetryable: (err: unknown) => !(err instanceof ProcesoCanceladoError),
      onReintento: opts.onReintento,
    };
  }

  async generarAnalisis(prompt: AnalisisPrompt, opts: OpcionesGeneracion = {}): Promise<AnalisisLlmResultado> {
    return withRetry(
      async () => parseAnalisisResponse(await this.chatStreaming(prompt, ANALISIS_JSON_SCHEMA, opts)),
      this.opcionesRetry("ollamaClient.generarAnalisis", opts)
    );
  }

  async generarMatching(prompt: MatchingPrompt, opts: OpcionesGeneracion = {}): Promise<MatchingLlmResultado> {
    return withRetry(
      async () => parseMatchingResponse(await this.chatStreaming(prompt, MATCHING_JSON_SCHEMA, opts)),
      this.opcionesRetry("ollamaClient.generarMatching", opts)
    );
  }

  /**
   * Embebe varios textos en una sola llamada. El llamador decide el tamaño del lote; acá no hay
   * política de sub-lotes, solo la llamada.
   *
   * Sin `signal`, a diferencia de generarAnalisis/generarMatching: `embed` de la lib no acepta uno
   * (no es streamable, así que nunca crea un AbortController), y un parámetro que no puede cancelar
   * nada es peor que no tenerlo. La cancelación de un batch de embeddings corta entre documentos,
   * no en medio de uno — que alcanza, porque un embed son segundos y no la generación de minutos
   * que sí hay que poder interrumpir.
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
