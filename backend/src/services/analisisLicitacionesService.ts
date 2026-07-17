import type { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import type {
  analisisLicitacionRepository,
  LicitacionPendiente,
} from "../repositories/analisisLicitacionRepository";
import type { perfilEmpresaRepository } from "../repositories/perfilEmpresaRepository";
import type { OpcionesItem, PlanProceso, SeleccionProceso } from "../types/procesos";
import { NotFoundError, ProcesoCanceladoError } from "../utils/errors";
import { segmentosDe } from "../utils/unspsc";
import { buildAnalisisPrompt, PROMPT_VERSION } from "./analisisPrompt";

export class AnalisisLicitacionesService {
  constructor(
    private readonly ollamaClient: OllamaClient,
    private readonly analisisRepo: typeof analisisLicitacionRepository,
    /**
     * El análisis en sí no sabe nada del perfil (sigue siendo una descripción neutra de la
     * licitación); el perfil solo se usa para decidir a cuáles vale la pena gastarles LLM.
     */
    private readonly perfilEmpresaRepo: typeof perfilEmpresaRepository
  ) {}

  /**
   * Decide qué licitaciones se van a analizar. Puro: no escribe nada, así que sirve igual para
   * arrancar un run y para mostrar una vista previa de lo que ese run haría.
   */
  async planificar(seleccion: SeleccionProceso): Promise<PlanProceso<LicitacionPendiente, void>> {
    if (seleccion.modo === "IDS") {
      const items = await this.analisisRepo.listarPorIds(seleccion.ids);

      const faltantes = seleccion.ids.filter((id) => !items.some((i) => i.id === id));
      if (faltantes.length > 0) {
        throw new NotFoundError(`No existen las licitaciones ${faltantes.join(", ")}`, "LICITACION_NO_ENCONTRADA");
      }

      return { items, omitidos: [], ctx: undefined, parametros: { modo: "IDS", ids: seleccion.ids } };
    }

    const segmentos = await this.segmentosDelPerfil();
    const items = await this.analisisRepo.listarPendientesActivas(segmentos);

    if (segmentos.length > 0) {
      logger.info({ segmentos, pendientes: items.length }, "Análisis acotado a los segmentos UNSPSC del perfil");
    }

    return { items, omitidos: [], ctx: undefined, parametros: { modo: "PENDIENTES", segmentos } };
  }

  /**
   * Segmentos UNSPSC declarados en el perfil. Sin perfil, o con un perfil sin categorías, devuelve
   * vacío y el batch procesa todo — el filtro nunca deja al sistema sin hacer nada.
   *
   * Solo acota el batch de pendientes: analizar por ids sigue analizando lo que le pidas.
   */
  private async segmentosDelPerfil(): Promise<string[]> {
    const perfil = await this.perfilEmpresaRepo.obtener();
    return perfil ? segmentosDe(perfil.categoriasUnspsc) : [];
  }

  async procesar(licitacion: LicitacionPendiente, opts: OpcionesItem) {
    const inicio = Date.now();
    const prompt = buildAnalisisPrompt(licitacion);

    try {
      const resultado = await this.ollamaClient.generarAnalisis(prompt, opts);
      const guardado = await this.analisisRepo.guardarCompletado({
        licitacionId: licitacion.id,
        resumenEjecutivo: resultado.resumenEjecutivo,
        puntosClave: resultado.puntosClave,
        palabrasClave: resultado.palabrasClave,
        nivelComplejidad: resultado.nivelComplejidad.toUpperCase() as "BAJA" | "MEDIA" | "ALTA",
        modelo: config.OLLAMA_MODEL,
        promptVersion: PROMPT_VERSION,
        duracionMs: Date.now() - inicio,
      });
      logger.info(
        { codigoExterno: licitacion.codigoExterno, duracionMs: guardado.duracionMs },
        "Análisis de licitación completado"
      );
      return guardado;
    } catch (err) {
      // Una cancelación no es un fallo del modelo: la licitación tiene que volver a la cola de
      // pendientes, no quedar marcada FALLIDA con un intento gastado y un detalleError que dice
      // "aborted" — que es indistinguible de un problema real cuando lo mirás una semana después.
      if (err instanceof ProcesoCanceladoError) throw err;

      await this.analisisRepo.guardarFallido({
        licitacionId: licitacion.id,
        modelo: config.OLLAMA_MODEL,
        promptVersion: PROMPT_VERSION,
        duracionMs: Date.now() - inicio,
        detalleError: err instanceof Error ? err.message : String(err),
      });
      logger.error({ err, codigoExterno: licitacion.codigoExterno }, "Análisis de licitación falló");
      throw err;
    }
  }
}
