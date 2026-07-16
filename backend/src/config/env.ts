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

  SCHEDULE_MODE: z.enum(["cron", "interval"]).default("cron"),
  SCHEDULE_VALUE: z.string().default("0 2 * * *"),

  STORAGE_LOGS_DIR: z.string().default("./storage/logs"),

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
