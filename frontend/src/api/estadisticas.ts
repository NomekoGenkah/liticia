import { apiRequest } from "./client";
import type { EstadisticasPanel } from "@/types/api";

export function obtenerEstadisticasPanel(): Promise<EstadisticasPanel> {
  return apiRequest("/estadisticas/panel");
}
