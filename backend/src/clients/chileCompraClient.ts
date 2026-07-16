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

/** Puerto mínimo para llevar la cuenta de requests diarias contra el límite del ticket. */
export interface RequestCounterPort {
  incrementarYObtener(fecha: Date): Promise<{ contador: number; limiteDiario: number }>;
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
    const { contador, limiteDiario } = await this.requestCounter.incrementarYObtener(new Date());
    if (contador > this.options.maxRequestsDia || contador > limiteDiario) {
      throw new ApiRateLimitError(
        `Límite de requests diarias alcanzado (${contador}/${Math.min(this.options.maxRequestsDia, limiteDiario)})`
      );
    }

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
