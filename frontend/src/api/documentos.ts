import { apiRequest, apiUpload } from "./client";
import type { LicitacionDocumento, ProcesoEstado } from "@/types/api";

export function listarDocumentos(codigoExterno: string): Promise<LicitacionDocumento[]> {
  return apiRequest(`/licitaciones/${codigoExterno}/documentos`);
}

export function subirDocumento(codigoExterno: string, archivo: File): Promise<LicitacionDocumento> {
  const formData = new FormData();
  formData.append("archivo", archivo);
  return apiUpload(`/licitaciones/${codigoExterno}/documentos`, formData);
}

export function eliminarDocumento(codigoExterno: string, id: string): Promise<void> {
  return apiRequest(`/licitaciones/${codigoExterno}/documentos/${id}`, { method: "DELETE" });
}

export function iniciarEmbeddingPendientes(): Promise<ProcesoEstado> {
  return apiRequest("/documentos/pendientes", { method: "POST" });
}

export function obtenerEstadoEmbedding(): Promise<ProcesoEstado> {
  return apiRequest("/documentos/estado");
}
