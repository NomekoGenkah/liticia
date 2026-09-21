import type { OpcionesItem } from "../types/procesos";
import type {
  LicitacionParaMatching,
  MatchingLlmResultado,
  PerfilEmpresaParaMatching,
} from "./ollamaClient.types";

/**
 * Contrato común desacoplado para cualquier proveedor de calificación/matching de licitaciones.
 * Permite alternar entre proveedores locales (Ollama) y APIs externas (TypeSafe AI) sin acoplar
 * el servicio de negocio (`MatchingLicitacionesService`).
 */
export interface MatchingClient {
  /** Nombre o identificador del modelo utilizado para registrarlo en la ejecución. */
  readonly modelo: string;

  /**
   * Evalúa la afinidad entre el perfil del postulante y la licitación analizada.
   */
  generarMatching(
    perfil: PerfilEmpresaParaMatching,
    licitacion: LicitacionParaMatching,
    opts?: OpcionesItem
  ): Promise<MatchingLlmResultado>;
}
