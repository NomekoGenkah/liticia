import { logger } from "../config/logger";

interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  context: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reintenta `fn` con backoff exponencial. Relanza el último error si se agotan los intentos. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === options.retries) break;

      const delayMs = options.baseDelayMs * 2 ** attempt;
      logger.warn(
        { context: options.context, attempt: attempt + 1, retries: options.retries, delayMs, err },
        "Reintentando request tras error"
      );
      await sleep(delayMs);
    }
  }

  logger.error({ context: options.context, err: lastError }, "Se agotaron los reintentos");
  throw lastError;
}
