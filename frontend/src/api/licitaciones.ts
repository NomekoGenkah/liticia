import { apiRequest } from "./client";
import type {
  LicitacionDetalle,
  LicitacionListItem,
  LicitacionAnalisis,
  LicitacionMatching,
  PaginatedResult,
  RecomendacionMatching,
} from "@/types/api";

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

export function generarAnalisis(codigoExterno: string): Promise<LicitacionAnalisis> {
  return apiRequest(`/licitaciones/${codigoExterno}/analisis`, { method: "POST" });
}

export function generarMatching(codigoExterno: string): Promise<LicitacionMatching> {
  return apiRequest(`/licitaciones/${codigoExterno}/matching`, { method: "POST" });
}
