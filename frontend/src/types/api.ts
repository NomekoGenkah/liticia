export type NivelComplejidad = "BAJA" | "MEDIA" | "ALTA";
export type AnalisisEstado = "COMPLETADO" | "FALLIDO";
export type RecomendacionMatching = "SI" | "NO" | "TAL_VEZ";
export type MatchingEstado = "COMPLETADO" | "FALLIDO";
export type TipoPerfil = "EMPRESA" | "PERSONA_NATURAL";
export type IngestaEstado = "EN_PROCESO" | "COMPLETADO" | "FALLIDO";
export type DocumentoEstadoExtraccion = "PENDIENTE" | "COMPLETADO" | "FALLIDO";
export type IngestaDisparador = "MANUAL" | "CRON";

/** Coincide con los valores que ChileCompra usa en el campo `Estado` guardado tal cual. */
export const ESTADOS_LICITACION = [
  "Publicada",
  "Cerrada",
  "Desierta",
  "Adjudicada",
  "Revocada",
  "Suspendida",
] as const;
export type EstadoLicitacion = (typeof ESTADOS_LICITACION)[number];

/** Valores que acepta el filtro de la ingesta manual (POST /api/ingesta/ejecutar). */
export const ESTADOS_FILTRO_INGESTA = [
  "publicada",
  "cerrada",
  "desierta",
  "adjudicada",
  "revocada",
  "suspendida",
  "todos",
  "activas",
] as const;
export type EstadoFiltroIngesta = (typeof ESTADOS_FILTRO_INGESTA)[number];

export interface AnalisisResumen {
  estado: AnalisisEstado;
  nivelComplejidad: NivelComplejidad | null;
}

export interface MatchingResumen {
  estado: MatchingEstado;
  puntaje: number | null;
  recomendacion: RecomendacionMatching | null;
}

/** Fila del listado paginado GET /api/licitaciones. */
export interface LicitacionListItem {
  id: string;
  codigoExterno: string;
  nombre: string;
  codigoEstado: number;
  estado: string;
  descripcion: string | null;
  nombreOrganismo: string | null;
  codigoOrganismo: string | null;
  rutOrganismo: string | null;
  regionUnidad: string | null;
  comunaUnidad: string | null;
  fechaPublicacion: string | null;
  fechaCierre: string | null;
  fechaAdjudicacion: string | null;
  montoEstimado: string | null;
  visibilidadMonto: number | null;
  moneda: string | null;
  tipo: string | null;
  codigoTipo: number | null;
  urlActaAdjudicacion: string | null;
  urlFichaPublica: string;
  analisis: AnalisisResumen | null;
  matching: MatchingResumen | null;
}

export interface LicitacionItem {
  id: string;
  licitacionId: string;
  nombreProducto: string;
  categoriaUnspsc: string | null;
  cantidad: number | null;
  unidadMedida: string | null;
}

export interface LicitacionAnalisis {
  id: string;
  licitacionId: string;
  resumenEjecutivo: string | null;
  puntosClave: string[];
  palabrasClave: string[];
  nivelComplejidad: NivelComplejidad | null;
  estado: AnalisisEstado;
  modelo: string;
  promptVersion: number;
  intentos: number;
  duracionMs: number | null;
  detalleError: string | null;
  generadoEn: string;
  actualizadoEn: string;
}

export interface LicitacionMatching {
  id: string;
  licitacionId: string;
  puntaje: number | null;
  recomendacion: RecomendacionMatching | null;
  justificacion: string | null;
  estado: MatchingEstado;
  modelo: string;
  promptVersion: number;
  perfilVersion: number;
  intentos: number;
  duracionMs: number | null;
  detalleError: string | null;
  generadoEn: string;
  actualizadoEn: string;
}

export interface LicitacionDocumento {
  id: string;
  licitacionId: string;
  nombreArchivo: string;
  mimeType: string;
  tamañoBytes: number;
  textoExtraido: string | null;
  estadoExtraccion: DocumentoEstadoExtraccion;
  detalleError: string | null;
  fechaCarga: string;
  /** Fragmentos indexados. En 0 el documento todavía no se puede consultar por chat. */
  chunksCount: number;
}

export interface CierrePorDia {
  /** YYYY-MM-DD. */
  dia: string;
  total: number;
}

/** Agregados de GET /api/estadisticas/panel. */
export interface EstadisticasPanel {
  activas: number;
  cierran7Dias: number;
  cierran48Horas: number;
  vencidas: number;
  totalLicitaciones: number;
  analizadasActivas: number;
  matcheadasActivas: number;
  recomendadasSi: number;
  hayPerfil: boolean;
  cierresPorDia: CierrePorDia[];
}

/** Un fragmento que se usó como contexto de una respuesta. */
export interface PreguntaFuente {
  documentoId: string;
  nombreArchivo: string;
  chunkIndex: number;
  /** Similitud coseno contra la pregunta, 0..1. */
  similitud: number;
  extracto: string;
}

export interface LicitacionPregunta {
  id: string;
  licitacionId: string;
  pregunta: string;
  respuesta: string;
  fuentes: PreguntaFuente[];
  modelo: string;
  promptVersion: number;
  duracionMs: number;
  creadoEn: string;
}

/** Detalle GET /api/licitaciones/:codigoExterno. */
export interface LicitacionDetalle extends Omit<LicitacionListItem, "analisis" | "matching"> {
  etapas: number | null;
  estadoEtapas: string | null;
  subContratacion: number | null;
  primeraVezVisto: string;
  ultimaActualizacion: string;
  fechaDetalleObtenido: string | null;
  ultimoEstadoConocido: number | null;
  items: LicitacionItem[];
  analisis: LicitacionAnalisis | null;
  matching: LicitacionMatching | null;
  documentos: LicitacionDocumento[];
  rawResponse?: unknown;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface PerfilEmpresa {
  id: string;
  tipo: TipoPerfil;
  nombre: string;
  descripcion: string;
  rubro: string | null;
  palabrasClave: string[];
  categoriasUnspsc: string[];
  regionesInteres: string[];
  montoMinimo: string | null;
  montoMaximo: string | null;
  version: number;
  actualizadoEn: string;
  creadoEn: string;
}

export interface PerfilEmpresaInput {
  tipo: TipoPerfil;
  nombre: string;
  descripcion: string;
  rubro?: string;
  palabrasClave: string[];
  categoriasUnspsc: string[];
  regionesInteres: string[];
  montoMinimo?: number;
  montoMaximo?: number;
}

export interface IngestaRun {
  id: string;
  parametros: unknown;
  disparadoPor: IngestaDisparador;
  fechaInicio: string;
  fechaFin: string | null;
  totalEncontradas: number;
  totalNuevas: number;
  totalActualizadas: number;
  totalErrores: number;
  estado: IngestaEstado;
  detalleError: string | null;
}

export interface IngestaResumen {
  totalEncontradas: number;
  totalNuevas: number;
  totalActualizadas: number;
  totalErrores: number;
}

export interface IngestaFiltrosInput {
  fecha?: string;
  estado?: EstadoFiltroIngesta;
  codigoOrganismo?: string;
  codigoProveedor?: string;
}

export interface ProcesoEstado {
  enProceso: boolean;
}

export interface PendientesResumen {
  totalEncontradas: number;
  totalCompletadas: number;
  totalFallidas: number;
}
