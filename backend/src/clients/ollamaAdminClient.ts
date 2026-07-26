import { OllamaApiError } from "../utils/errors";

/** Un modelo instalado en Ollama, tal como lo devuelve `GET /api/tags`. */
export interface ModeloInstalado {
  nombre: string;
  tamañoBytes: number;
  familia: string | null;
  parametros: string | null;
  cuantizacion: string | null;
}

/** Un evento de progreso de `POST /api/pull` (NDJSON, un objeto por línea). */
export interface ProgresoPull {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

interface TagsResponse {
  models?: {
    name: string;
    size: number;
    details?: { family?: string; parameter_size?: string; quantization_level?: string };
  }[];
}

/**
 * Cliente de ADMINISTRACIÓN de Ollama, separado a propósito de `OllamaClient` (generación):
 * lista, descarga y borra modelos. No comparte la política de reintentos/timeouts de generación
 * porque son operaciones de gestión con semántica distinta (un pull dura minutos y streamea).
 */
export class OllamaAdminClient {
  constructor(private readonly host: string) {}

  private url(path: string): string {
    return `${this.host.replace(/\/$/, "")}${path}`;
  }

  /** Modelos ya descargados en el host de Ollama. */
  async listar(): Promise<ModeloInstalado[]> {
    let res: Response;
    try {
      res = await fetch(this.url("/api/tags"));
    } catch (err) {
      throw new OllamaApiError(`No se pudo consultar los modelos de Ollama (${this.host}): ${mensaje(err)}`);
    }
    if (!res.ok) throw new OllamaApiError(`Ollama respondió ${res.status} al listar modelos`);

    const data = (await res.json()) as TagsResponse;
    return (data.models ?? []).map((m) => ({
      nombre: m.name,
      tamañoBytes: m.size,
      familia: m.details?.family ?? null,
      parametros: m.details?.parameter_size ?? null,
      cuantizacion: m.details?.quantization_level ?? null,
    }));
  }

  /**
   * Descarga un modelo, emitiendo el progreso a medida que llega. `POST /api/pull` responde un
   * stream NDJSON; cada línea es un `ProgresoPull`. El `signal` permite abortar la descarga si el
   * cliente HTTP (la conexión SSE del frontend) se corta.
   */
  async *pull(model: string, signal?: AbortSignal): AsyncGenerator<ProgresoPull> {
    let res: Response;
    try {
      res = await fetch(this.url("/api/pull"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: true }),
        signal,
      });
    } catch (err) {
      throw new OllamaApiError(`No se pudo iniciar la descarga de ${model} (${this.host}): ${mensaje(err)}`);
    }
    if (!res.ok || !res.body) throw new OllamaApiError(`Ollama respondió ${res.status} al descargar ${model}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Ollama puede mandar varias líneas por chunk; una línea puede quedar partida entre chunks.
        let corte: number;
        while ((corte = buffer.indexOf("\n")) !== -1) {
          const linea = buffer.slice(0, corte).trim();
          buffer = buffer.slice(corte + 1);
          if (!linea) continue;

          let evento: ProgresoPull & { error?: string };
          try {
            evento = JSON.parse(linea);
          } catch {
            continue; // línea incompleta o basura: la ignoramos en vez de romper la descarga
          }
          if (evento.error) throw new OllamaApiError(`Ollama falló al descargar ${model}: ${evento.error}`);
          yield evento;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /** Borra un modelo del host para liberar disco. */
  async eliminar(model: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.url("/api/delete"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
    } catch (err) {
      throw new OllamaApiError(`No se pudo eliminar ${model} (${this.host}): ${mensaje(err)}`);
    }
    if (!res.ok) throw new OllamaApiError(`Ollama respondió ${res.status} al eliminar ${model}`);
  }
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
