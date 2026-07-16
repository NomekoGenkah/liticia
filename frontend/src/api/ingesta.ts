import { apiRequest } from "./client";
import type { IngestaFiltrosInput, IngestaResumen, IngestaRun, PaginationMeta, ProcesoEstado } from "@/types/api";

export function ejecutarIngesta(filtros: IngestaFiltrosInput): Promise<IngestaResumen> {
  return apiRequest("/ingesta/ejecutar", { method: "POST", body: filtros });
}

export function obtenerEstadoIngesta(): Promise<ProcesoEstado> {
  return apiRequest("/ingesta/estado");
}

export function listarIngestaRuns(page: number, pageSize: number): Promise<{ runs: IngestaRun[]; meta: PaginationMeta }> {
  return apiRequest("/ingesta/runs", { searchParams: { page, pageSize } });
}
