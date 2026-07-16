import { apiRequest } from "./client";
import type { PerfilEmpresa, PerfilEmpresaInput } from "@/types/api";

export function obtenerPerfilEmpresa(): Promise<PerfilEmpresa> {
  return apiRequest("/perfil-empresa");
}

export function guardarPerfilEmpresa(input: PerfilEmpresaInput): Promise<PerfilEmpresa> {
  return apiRequest("/perfil-empresa", { method: "PUT", body: input });
}
