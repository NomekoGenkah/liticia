import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),

  CHILECOMPRA_TICKET: z.string().min(1, "CHILECOMPRA_TICKET es obligatorio"),
  CHILECOMPRA_API_BASE: z.string().url(),
  CHILECOMPRA_MAX_REQUESTS_DIA: z.coerce.number().int().positive().default(10000),
  CHILECOMPRA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  CHILECOMPRA_RETRY_MAX: z.coerce.number().int().min(0).default(3),
  CHILECOMPRA_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(500),

  OLLAMA_URL: z.string().url().default("http://host.docker.internal:11434"),
  OLLAMA_MODEL: z.string().default("qwen3:8b"),
  /**
   * Tope de pared para las llamadas SIN streaming: generarEmbedding() y generarRespuesta().
   * Análisis y matching ya no lo usan — al pasar a streaming, cortar una generación por ser larga
   * dejó de tener sentido, y lo reemplaza OLLAMA_STREAM_IDLE_TIMEOUT_MS.
   */
  OLLAMA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  /**
   * Máximo hueco tolerado ENTRE tokens en una generación con streaming. Es lo que detecta un
   * Ollama colgado: mientras el modelo escriba, la generación sigue por más que tarde.
   */
  OLLAMA_STREAM_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  /**
   * Red de seguridad de pared para el streaming, por si el watchdog de inactividad no alcanza
   * (un modelo que emite un token cada 59s indefinidamente). No debería dispararse nunca.
   */
  OLLAMA_STREAM_HARD_CAP_MS: z.coerce.number().int().positive().default(600000),
  OLLAMA_RETRY_MAX: z.coerce.number().int().min(0).default(2),
  OLLAMA_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
  OLLAMA_THINK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  OLLAMA_EMBED_MODEL: z.string().default("nomic-embed-text"),
  OLLAMA_EMBED_BATCH_SIZE: z.coerce.number().int().positive().default(16),
  OLLAMA_RAG_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  OLLAMA_RAG_NUM_CTX: z.coerce.number().int().positive().default(8192),
  RAG_TOP_K: z.coerce.number().int().positive().default(5),

  SCHEDULE_MODE: z.enum(["cron", "interval"]).default("cron"),
  SCHEDULE_VALUE: z.string().default("0 2 * * *"),

  STORAGE_LOGS_DIR: z.string().default("./storage/logs"),
  STORAGE_DOCUMENTOS_DIR: z.string().default("./storage/documentos"),

  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuración de entorno inválida:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
