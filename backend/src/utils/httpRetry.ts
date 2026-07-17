import { logger } from "../config/logger";

interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  context: string;
  /**
   * Si devuelve false, corta sin reintentar y relanza el error tal cual.
   *
   * Por default todo es retryable, que es el comportamiento histórico de este helper. El único
   * caso que hoy lo necesita es la cancelación: reintentar algo que el usuario acaba de cancelar
   * significa que el botón "Cancelar" *inicia* trabajo nuevo contra Ollama.
   */
  esRetryable?: (err: unknown) => boolean;
  /** Se llama antes de cada reintento. Sirve para descartar la salida parcial del intento fallido. */
  onReintento?: (intento: number) => void;
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
      if (options.esRetryable?.(err) === false) throw err;
      if (attempt === options.retries) break;

      const delayMs = options.baseDelayMs * 2 ** attempt;
      logger.warn(
        { context: options.context, attempt: attempt + 1, retries: options.retries, delayMs, err },
        "Reintentando request tras error"
      );
      await sleep(delayMs);
      options.onReintento?.(attempt + 1);
    }
  }

  logger.error({ context: options.context, err: lastError }, "Se agotaron los reintentos");
  throw lastError;
}
