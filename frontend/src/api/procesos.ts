import { apiRequest } from "./client";
import type { PaginationMeta } from "@/types/api";
import {
  SLUG_PROCESO,
  type EjecutarProcesoResultado,
  type EstadoProceso,
  type ProcesoRun,
  type ProcesoRunDetalle,
  type ProcesoTipo,
  type VistaPreviaProceso,
} from "@/types/procesos";

export function obtenerEstadoProceso(tipo: ProcesoTipo): Promise<EstadoProceso> {
  return apiRequest(`/procesos/${SLUG_PROCESO[tipo]}/estado`);
}

/** Qué haría el batch si se disparara ahora, para poder revisarlo antes de gastar horas de LLM. */
export function obtenerPendientes(tipo: ProcesoTipo): Promise<VistaPreviaProceso> {
  return apiRequest(`/procesos/${SLUG_PROCESO[tipo]}/pendientes`);
}

/**
 * Sin `ids` corre los pendientes que elija el sistema (con el prefiltro UNSPSC); con `ids` corre
 * exactamente esos, sin filtro — los eligió el usuario.
 */
export function ejecutarProceso(tipo: ProcesoTipo, ids?: string[]): Promise<EjecutarProcesoResultado> {
  return apiRequest(`/procesos/${SLUG_PROCESO[tipo]}/ejecutar`, { method: "POST", body: ids ? { ids } : {} });
}

export function cancelarProceso(tipo: ProcesoTipo): Promise<{ runId: string }> {
  return apiRequest(`/procesos/${SLUG_PROCESO[tipo]}/cancelar`, { method: "POST" });
}

export function listarProcesoRuns(
  page: number,
  pageSize: number,
  tipo?: ProcesoTipo
): Promise<{ runs: ProcesoRun[]; meta: PaginationMeta }> {
  return apiRequest("/procesos/runs", { searchParams: { page, pageSize, tipo } });
}

export function obtenerProcesoRun(id: string): Promise<ProcesoRunDetalle> {
  return apiRequest(`/procesos/runs/${id}`);
}
