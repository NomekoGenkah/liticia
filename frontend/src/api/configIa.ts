import { apiRequest } from "./client";

export type ProveedorIa = "OLLAMA" | "CLOUD";
export type Fit = "holgado" | "justo" | "no_entra" | "desconocido";

export interface ConfiguracionIa {
  proveedor: ProveedorIa;
  modeloChat: string | null;
  vramBudgetMb: number | null;
  ramBudgetMb: number | null;
  modeloChatActivo: string;
}

export interface ModeloConEstado {
  nombre: string;
  tamañoMb: number;
  parametros: string;
  blurb: string;
  recomendado?: boolean;
  instalado: boolean;
  fit: Fit;
}

export interface ModelosResponse {
  modelos: ModeloConEstado[];
  vramBudgetMb: number | null;
  modeloChatActivo: string;
}

export interface Hardware {
  vramMb: number | null;
  vramNombre: string | null;
  ramTotalMb: number;
  ramLibreMb: number;
  gpuDetectada: boolean;
}

export interface ProgresoPull {
  status?: string;
  total?: number;
  completed?: number;
  done?: boolean;
  error?: string;
}

export interface GuardarConfigInput {
  proveedor?: ProveedorIa;
  modeloChat?: string | null;
  vramBudgetMb?: number | null;
  ramBudgetMb?: number | null;
}

export function obtenerConfigIa(): Promise<ConfiguracionIa> {
  return apiRequest("/config-ia");
}

export function guardarConfigIa(input: GuardarConfigInput): Promise<ConfiguracionIa> {
  return apiRequest("/config-ia", { method: "PUT", body: input });
}

export function listarModelos(): Promise<ModelosResponse> {
  return apiRequest("/config-ia/modelos");
}

export function obtenerHardware(): Promise<Hardware> {
  return apiRequest("/config-ia/hardware");
}

export function eliminarModelo(nombre: string): Promise<void> {
  return apiRequest(`/config-ia/modelos/${encodeURIComponent(nombre)}`, { method: "DELETE" });
}

/**
 * Descarga un modelo consumiendo el stream SSE del backend con fetch()+reader (no EventSource,
 * porque el endpoint es un POST). Llama a `onProgreso` por cada evento hasta que termina o falla.
 */
export async function descargarModelo(
  model: string,
  onProgreso: (ev: ProgresoPull) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/config-ia/modelos/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Error ${res.status} al iniciar la descarga de ${model}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Los eventos SSE se separan por línea en blanco (\n\n); una línea es `data: {json}`.
    let corte: number;
    while ((corte = buffer.indexOf("\n\n")) !== -1) {
      const bloque = buffer.slice(0, corte).trim();
      buffer = buffer.slice(corte + 2);
      if (!bloque.startsWith("data:")) continue;

      let ev: ProgresoPull;
      try {
        ev = JSON.parse(bloque.slice(5).trim());
      } catch {
        continue;
      }
      if (ev.error) throw new Error(ev.error);
      onProgreso(ev);
    }
  }
}
