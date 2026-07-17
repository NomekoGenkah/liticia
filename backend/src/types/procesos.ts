import type { Prisma, ProcesoDisparador, ProcesoItemEstado, ProcesoRunEstado, ProcesoTipo } from "@prisma/client";
import type { CanalToken } from "../clients/ollamaClient";

export type { CanalToken, ProcesoDisparador, ProcesoItemEstado, ProcesoRunEstado, ProcesoTipo };

export const TIPOS_PROCESO: ProcesoTipo[] = ["ANALISIS", "MATCHING", "EMBEDDING"];

/**
 * Qué se manda a procesar. PENDIENTES lo decide el sistema (con el prefiltro UNSPSC); IDS lo
 * decide el usuario, y por eso no se le aplica ningún filtro: si eligió esas, ya decidió.
 */
export type SeleccionProceso = { modo: "PENDIENTES" } | { modo: "IDS"; ids: string[] };

/** Lo que hace falta para mostrar un ítem sin volver a la base. */
export interface DescriptorItem {
  /** licitacionId | documentoId. */
  objetoId: string;
  /** codigoExterno | nombreArchivo. La clave que el usuario reconoce. */
  etiqueta: string;
  titulo: string | null;
  subtitulo: string | null;
}

export interface ItemOmitido extends DescriptorItem {
  motivo: string;
  /** Si el plan entero queda sin ítems, este código sale como el 422 del POST. */
  codigo: string;
}

export interface PlanProceso<TItem, TCtx> {
  items: TItem[];
  omitidos: ItemOmitido[];
  ctx: TCtx;
  parametros: Prisma.InputJsonValue;
}

/** Un PlanProceso en la forma en que se muestra: sin ctx y con los ítems ya descritos. */
export interface VistaPreviaProceso {
  items: DescriptorItem[];
  omitidos: ItemOmitido[];
  parametros: Prisma.InputJsonValue;
}

export interface OpcionesItem {
  signal: AbortSignal;
  onToken: (texto: string, canal: CanalToken) => void;
  onReintento: (intento: number) => void;
}

/** Lo específico de cada tipo de proceso. Todo lo demás lo hace ProcesoRunner. */
export interface DefinicionProceso<TItem, TCtx> {
  tipo: ProcesoTipo;
  /** Con qué modelo corre. Se guarda en el run. */
  modelo(): string;
  /** Puro: lo usan tanto el arranque como la vista previa. No escribe nada. */
  planificar(seleccion: SeleccionProceso): Promise<PlanProceso<TItem, TCtx>>;
  describir(item: TItem): DescriptorItem;
  /** Debe dejar propagar ProcesoCanceladoError SIN persistir estado de fallo. */
  procesar(item: TItem, ctx: TCtx, opts: OpcionesItem): Promise<"COMPLETADO" | "OMITIDO">;
}

export interface ResumenProceso {
  totalEncontradas: number;
  totalCompletadas: number;
  totalFallidas: number;
  totalOmitidos: number;
}

export interface ItemActual extends DescriptorItem {
  indice: number;
  fechaInicio: string;
  /**
   * Acumulado de lo que va escribiendo el modelo en el ítem en curso. Va en el snapshot para que
   * una pestaña que se conecta a mitad vea el texto completo y no solo lo que salga de ahí en más.
   */
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
  /**
   * Solo los ids de la cola (~37 B cada uno). Alcanza para que el detalle de una licitación sepa si
   * está en el run activo, sin mandar la cola entera con sus descriptores.
   */
  objetoIds: string[];
  actual: ItemActual | null;
  detalleError: string | null;
}

export interface EstadoProceso {
  enProceso: boolean;
  /** El último run, vivo o recién terminado: el panel muestra el resumen incluso al cerrar. */
  run: RunVivo | null;
}

/**
 * Eventos que viajan por SSE. El discriminante es `evento` y no `tipo`, porque `tipo` ya es el
 * ProcesoTipo — los dos viajan en todos los eventos, ya que el stream está multiplexado.
 *
 * Los eventos de ítem llevan los contadores acumulados en vez de dejar que el cliente sume: así
 * una pestaña que se perdió un evento se auto-corrige en el siguiente, sin replay.
 */
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
