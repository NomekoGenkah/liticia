/**
 * Copia del contrato de `backend/src/types/procesos.ts`.
 *
 * No hay monorepo ni paquete compartido: es la misma deuda que ya tienen los tipos de `api.ts`.
 * Si cambia el backend, este archivo cambia con él.
 */

export type ProcesoTipo = "ANALISIS" | "MATCHING" | "EMBEDDING";
export type ProcesoDisparador = "MANUAL" | "CLI";
export type ProcesoRunEstado = "EN_PROCESO" | "COMPLETADO" | "FALLIDO" | "CANCELADO" | "INTERRUMPIDO";
export type ProcesoItemEstado = "PENDIENTE" | "EN_PROCESO" | "COMPLETADO" | "FALLIDO" | "OMITIDO" | "CANCELADO";
export type CanalToken = "respuesta" | "pensamiento";

export const TIPOS_PROCESO: ProcesoTipo[] = ["ANALISIS", "MATCHING", "EMBEDDING"];

/** El slug de la URL de cada tipo. */
export const SLUG_PROCESO: Record<ProcesoTipo, string> = {
  ANALISIS: "analisis",
  MATCHING: "matching",
  EMBEDDING: "embeddings",
};

export interface DescriptorItem {
  objetoId: string;
  /** codigoExterno | nombreArchivo. */
  etiqueta: string;
  titulo: string | null;
  subtitulo: string | null;
}

export interface ItemOmitido extends DescriptorItem {
  motivo: string;
  codigo: string;
}

export interface ItemActual extends DescriptorItem {
  indice: number;
  fechaInicio: string;
  texto: string;
  pensamiento: string;
}

export interface RunVivo {
  id: string;
  tipo: ProcesoTipo;
  estado: ProcesoRunEstado;
  fechaInicio: string;
  fechaFin: string | null;
  total: number;
  completadas: number;
  fallidas: number;
  omitidos: number;
  /** Los ids de la cola: con esto el detalle sabe si su licitación está en el run activo. */
  objetoIds: string[];
  actual: ItemActual | null;
  detalleError: string | null;
}

export interface EstadoProceso {
  enProceso: boolean;
  run: RunVivo | null;
}

export interface VistaPreviaProceso {
  items: DescriptorItem[];
  omitidos: ItemOmitido[];
  parametros: unknown;
}

export interface EjecutarProcesoResultado {
  runId: string;
  tipo: string;
  totalEncontradas: number;
}

export interface ProcesoRun {
  id: string;
  tipo: ProcesoTipo;
  disparadoPor: ProcesoDisparador;
  parametros: unknown;
  modelo: string;
  fechaInicio: string;
  fechaFin: string | null;
  totalEncontradas: number;
  totalCompletadas: number;
  totalFallidas: number;
  totalOmitidos: number;
  estado: ProcesoRunEstado;
  detalleError: string | null;
}

export interface ProcesoRunItem {
  id: string;
  objetoId: string;
  etiqueta: string;
  titulo: string | null;
  subtitulo: string | null;
  orden: number;
  estado: ProcesoItemEstado;
  duracionMs: number | null;
  detalleError: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
}

export type ProcesoRunDetalle = ProcesoRun & { items: ProcesoRunItem[] };

/** El discriminante es `evento`: `tipo` ya es el ProcesoTipo, porque el stream está multiplexado. */
export type ProcesoEvento =
  | { tipo: ProcesoTipo; evento: "snapshot"; estado: EstadoProceso }
  | { tipo: ProcesoTipo; evento: "run-iniciado"; run: RunVivo }
  | { tipo: ProcesoTipo; evento: "item-iniciado"; actual: ItemActual }
  | { tipo: ProcesoTipo; evento: "token"; texto: string; canal: CanalToken }
  | { tipo: ProcesoTipo; evento: "item-reintentado"; intento: number }
  | {
      tipo: ProcesoTipo;
      evento: "item-finalizado";
      indice: number;
      objetoId: string;
      etiqueta: string;
      estado: ProcesoItemEstado;
      duracionMs: number;
      detalleError: string | null;
      completadas: number;
      fallidas: number;
      omitidos: number;
    }
  | {
      tipo: ProcesoTipo;
      evento: "run-finalizado";
      runId: string;
      estado: ProcesoRunEstado;
      completadas: number;
      fallidas: number;
      omitidos: number;
      detalleError: string | null;
    };
