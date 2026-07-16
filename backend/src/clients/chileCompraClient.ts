import { logger } from "../config/logger";
import { ApiRateLimitError, ChileCompraApiError } from "../utils/errors";
import { toChileCompraDate } from "../utils/dateFormat";
import { withRetry } from "../utils/httpRetry";
import type {
  LicitacionDetalleRaw,
  LicitacionListadoRaw,
  LicitacionesResponseRaw,
  SearchFiltros,
} from "./chileCompraClient.types";

/**
 * Puerto mínimo para llevar la cuenta de requests diarias contra el límite del ticket.
 *
 * Son dos operaciones separadas a propósito: consultar la cuota no la consume, y solo se registra
 * lo que efectivamente sale a la API. Antes se incrementaba antes de chequear el tope, así que los
 * intentos rechazados por el propio guardarraíl igual sumaban y el contador terminaba midiendo
 * intentos en vez de requests reales (en la práctica: 1205 anotados con ~500 llamadas hechas).
 */
export interface RequestCounterPort {
  /** Cuota consumida hoy, sin consumir nada. */
  obtener(fecha: Date): Promise<{ contador: number; limiteDiario: number }>;
  /** Registra un request que sí se envió a la API. */
  registrar(fecha: Date): Promise<void>;
}

interface ChileCompraClientOptions {
  ticket: string;
  apiBase: string;
  timeoutMs: number;
  retryMax: number;
  retryBaseDelayMs: number;
  maxRequestsDia: number;
}

export class ChileCompraClient {
  constructor(
    private readonly options: ChileCompraClientOptions,
    private readonly requestCounter: RequestCounterPort
  ) {}

  /** Búsqueda por fecha/estado/organismo/proveedor. Devuelve solo el listado básico del día consultado. */
  async search(filtros: SearchFiltros = {}): Promise<LicitacionListadoRaw[]> {
    const params: Record<string, string> = {};
    if (filtros.fecha) params.fecha = toChileCompraDate(filtros.fecha);
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.codigoOrganismo) params.CodigoOrganismo = filtros.codigoOrganismo;
    if (filtros.codigoProveedor) params.CodigoProveedor = filtros.codigoProveedor;

    const response = await this.request<LicitacionListadoRaw>(params);
    return response.Listado;
  }

  /** Búsqueda por código: ignora la fecha y devuelve la ficha completa de la licitación. */
  async getDetail(codigo: string): Promise<LicitacionDetalleRaw | null> {
    const response = await this.request<LicitacionDetalleRaw>({ codigo });
    return response.Listado[0] ?? null;
  }

  private async request<T>(params: Record<string, string>): Promise<LicitacionesResponseRaw<T>> {
    const ahora = new Date();
    const { contador, limiteDiario } = await this.requestCounter.obtener(ahora);
    const tope = Math.min(this.options.maxRequestsDia, limiteDiario);

    if (contador >= tope) {
      throw new ApiRateLimitError(
        `Alcanzaste el tope local de ${tope} requests diarias a ChileCompra (llevas ${contador} hoy). ` +
          `No es un rechazo de ChileCompra: su límite real es de 10.000 diarias por ticket, y este tope ` +
          `lo define CHILECOMPRA_MAX_REQUESTS_DIA en el .env. Súbelo si necesitas más, o espera a mañana ` +
          `(el contador se reinicia cada día).`
      );
    }

    // Solo se anota lo que va a salir de verdad: si el tope corta antes, el contador no se mueve.
    await this.requestCounter.registrar(ahora);

    const url = new URL(`${this.options.apiBase}/licitaciones.json`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("ticket", this.options.ticket);

    const loggableParams = { ...params };

    return withRetry(
      async () => {
        logger.info({ params: loggableParams, contadorHoy: contador }, "Consultando API ChileCompra");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) {
            throw new ChileCompraApiError(`ChileCompra API respondió ${res.status} para ${url.pathname}`);
          }
          return (await res.json()) as LicitacionesResponseRaw<T>;
        } finally {
          clearTimeout(timeout);
        }
      },
      {
        retries: this.options.retryMax,
        baseDelayMs: this.options.retryBaseDelayMs,
        context: "chileCompraClient.request",
      }
    );
  }
}
