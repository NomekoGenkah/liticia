import { apiRequest } from "./client";
import type { ProcesoEstado } from "@/types/api";

export function iniciarMatchingPendientes(): Promise<ProcesoEstado> {
  return apiRequest("/matching/pendientes", { method: "POST" });
}

export function obtenerEstadoMatching(): Promise<ProcesoEstado> {
  return apiRequest("/matching/estado");
}
