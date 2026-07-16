import { apiRequest } from "./client";
import type { ProcesoEstado } from "@/types/api";

export function iniciarAnalisisPendientes(): Promise<ProcesoEstado> {
  return apiRequest("/analisis/pendientes", { method: "POST" });
}

export function obtenerEstadoAnalisis(): Promise<ProcesoEstado> {
  return apiRequest("/analisis/estado");
}
