import { apiRequest } from "./client";
import type { LicitacionDetalle, LicitacionListItem, PaginatedResult, RecomendacionMatching } from "@/types/api";
import type { EjecutarProcesoResultado } from "@/types/procesos";

export interface ListarLicitacionesParams {
  page?: number;
  pageSize?: number;
  estado?: string;
  codigoOrganismo?: string;
  fechaCierreDesde?: string;
  fechaCierreHasta?: string;
  recomendacion?: RecomendacionMatching;
  orderBy?: string;
}

export function listarLicitaciones(
  params: ListarLicitacionesParams
): Promise<PaginatedResult<LicitacionListItem>> {
  return apiRequest("/licitaciones", { searchParams: params });
}

export function obtenerLicitacion(codigoExterno: string): Promise<LicitacionDetalle> {
  return apiRequest(`/licitaciones/${codigoExterno}`);
}

/**
 * Dispara un run de una sola licitación y vuelve enseguida: no espera al modelo.
 *
 * El resultado no viene en la respuesta — llega por el stream de eventos, igual que el de un batch,
 * y la fila se refresca sola al terminar.
 */
export function generarAnalisis(codigoExterno: string): Promise<EjecutarProcesoResultado> {
  return apiRequest(`/licitaciones/${codigoExterno}/analisis`, { method: "POST" });
}

export function generarMatching(codigoExterno: string): Promise<EjecutarProcesoResultado> {
  return apiRequest(`/licitaciones/${codigoExterno}/matching`, { method: "POST" });
}
