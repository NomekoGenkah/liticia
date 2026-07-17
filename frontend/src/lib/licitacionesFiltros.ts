import type { LicitacionesFiltrosState } from "@/components/licitaciones/LicitacionesFilters";

export const ORDEN_POR_DEFECTO = "fechaPublicacion:desc";

/** Las recomendaciones válidas: la URL la escribe cualquiera y puede traer cualquier cosa. */
const RECOMENDACIONES = ["SI", "NO", "TAL_VEZ"] as const;

/** Traduce los query params (input no confiable) al estado de filtros, descartando lo inválido. */
export function leerFiltros(params: URLSearchParams): LicitacionesFiltrosState {
  const recomendacion = params.get("recomendacion");

  return {
    estado: params.get("estado") ?? undefined,
    codigoOrganismo: params.get("codigoOrganismo") ?? undefined,
    recomendacion: RECOMENDACIONES.find((r) => r === recomendacion),
    orderBy: params.get("orderBy") ?? ORDEN_POR_DEFECTO,
  };
}
