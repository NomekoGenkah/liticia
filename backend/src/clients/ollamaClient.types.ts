export interface LicitacionItemParaAnalisis {
  nombreProducto: string;
  categoriaUnspsc: string | null;
  cantidad: number | null;
  unidadMedida: string | null;
}

export interface LicitacionParaAnalisis {
  nombre: string;
  descripcion: string | null;
  nombreOrganismo: string | null;
  montoEstimado: number | null;
  moneda: string | null;
  tipo: string | null;
  fechaPublicacion: Date | null;
  fechaCierre: Date | null;
  items: LicitacionItemParaAnalisis[];
}

export type NivelComplejidadLlm = "baja" | "media" | "alta";

export interface AnalisisLlmResultado {
  resumenEjecutivo: string;
  puntosClave: string[];
  palabrasClave: string[];
  nivelComplejidad: NivelComplejidadLlm;
}

export interface PerfilEmpresaParaMatching {
  nombre: string;
  descripcion: string;
  rubro: string | null;
  palabrasClave: string[];
  categoriasUnspsc: string[];
  regionesInteres: string[];
  montoMinimo: number | null;
  montoMaximo: number | null;
}

export interface LicitacionAnalisisParaMatching {
  resumenEjecutivo: string | null;
  puntosClave: string[];
  palabrasClave: string[];
  nivelComplejidad: "BAJA" | "MEDIA" | "ALTA" | null;
}

export interface LicitacionParaMatching {
  nombre: string;
  nombreOrganismo: string | null;
  montoEstimado: number | null;
  moneda: string | null;
  regionUnidad: string | null;
  tipo: string | null;
  fechaCierre: Date | null;
  analisis: LicitacionAnalisisParaMatching;
}

export type RecomendacionMatchingLlm = "si" | "no" | "tal_vez";

export interface MatchingLlmResultado {
  puntaje: number;
  recomendacion: RecomendacionMatchingLlm;
  justificacion: string;
}
