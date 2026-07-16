import { apiRequest } from "./client";
import type { LicitacionPregunta } from "@/types/api";

export function listarPreguntas(codigoExterno: string): Promise<LicitacionPregunta[]> {
  return apiRequest(`/licitaciones/${codigoExterno}/preguntas`);
}

export function crearPregunta(codigoExterno: string, pregunta: string): Promise<LicitacionPregunta> {
  return apiRequest(`/licitaciones/${codigoExterno}/preguntas`, { method: "POST", body: { pregunta } });
}
