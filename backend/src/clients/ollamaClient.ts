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
}

export interface AnalisisPrompt {
  system: string;
  user: string;
}

export interface MatchingPrompt {
  system: string;
  user: string;
}

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
}
