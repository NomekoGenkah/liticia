/** Formas crudas de la respuesta de la API pública de ChileCompra (api.mercadopublico.cl). */

export type EstadoFiltro =
  | "publicada"
  | "cerrada"
  | "desierta"
  | "adjudicada"
  | "revocada"
  | "suspendida"
  | "todos"
  | "activas";

export interface SearchFiltros {
  fecha?: Date;
  estado?: EstadoFiltro;
  codigoOrganismo?: string;
  codigoProveedor?: string;
}

/** Item del listado básico devuelto por búsquedas por fecha/estado/organismo/proveedor. */
export interface LicitacionListadoRaw {
  CodigoExterno: string;
  Nombre: string;
  CodigoEstado: number;
  FechaCierre: string | null;
}

export interface CompradorRaw {
  CodigoOrganismo: string;
  NombreOrganismo: string;
  RutUnidad: string;
  CodigoUnidad: string;
  NombreUnidad: string;
  DireccionUnidad: string;
  ComunaUnidad: string;
  RegionUnidad: string;
}

export interface FechasRaw {
  FechaCreacion: string | null;
  FechaCierre: string | null;
  FechaPublicacion: string | null;
  FechaAdjudicacion: string | null;
  FechaEstimadaAdjudicacion: string | null;
}

export interface ItemRaw {
  Correlativo: number;
  CodigoProducto: number;
  CodigoCategoria: string;
  Categoria: string;
  NombreProducto: string;
  Descripcion: string;
  UnidadMedida: string;
  Cantidad: number;
}

export interface AdjudicacionRaw {
  UrlActa?: string | null;
}

/** Ficha completa devuelta por la búsqueda por `codigo` (ignora fecha). */
export interface LicitacionDetalleRaw {
  CodigoExterno: string;
  Nombre: string;
  CodigoEstado: number;
  Estado: string;
  Descripcion: string | null;
  Comprador: CompradorRaw;
  Fechas: FechasRaw;
  MontoEstimado: number | null;
  VisibilidadMonto: number;
  Moneda: string;
  Tipo: string;
  CodigoTipo: number;
  Etapas: number;
  EstadoEtapas: string;
  SubContratacion: string;
  Adjudicacion: AdjudicacionRaw | null;
  Items: {
    Cantidad: number;
    Listado: ItemRaw[];
  };
  [key: string]: unknown;
}

export interface LicitacionesResponseRaw<T> {
  Cantidad: number;
  FechaCreacion: string;
  Version: string;
  Listado: T[];
}
