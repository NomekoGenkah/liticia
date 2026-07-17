import type { OllamaClient } from "../clients/ollamaClient";
import type { PerfilEmpresaParaMatching } from "../clients/ollamaClient.types";
import { config } from "../config/env";
import { logger } from "../config/logger";
import type {
  matchingLicitacionRepository,
  LicitacionParaMatchingPendiente,
} from "../repositories/matchingLicitacionRepository";
import type { perfilEmpresaRepository } from "../repositories/perfilEmpresaRepository";
import type { ItemOmitido, OpcionesItem, PlanProceso, SeleccionProceso } from "../types/procesos";
import { NotFoundError, ProcesoCanceladoError, UnprocessableEntityError } from "../utils/errors";
import { segmentosDe } from "../utils/unspsc";
import { buildMatchingPrompt, MATCHING_PROMPT_VERSION } from "./matchingPrompt";

/** El perfil resuelto una sola vez por run, en vez de releerlo por cada licitación. */
export interface ContextoMatching {
  perfil: PerfilEmpresaParaMatching;
  perfilVersion: number;
}

function toPerfilParaMatching(perfil: {
  tipo: PerfilEmpresaParaMatching["tipo"];
  nombre: string;
  descripcion: string;
  rubro: string | null;
  palabrasClave: string[];
  categoriasUnspsc: string[];
  regionesInteres: string[];
  montoMinimo: unknown;
  montoMaximo: unknown;
}): PerfilEmpresaParaMatching {
  return {
    tipo: perfil.tipo,
    nombre: perfil.nombre,
    descripcion: perfil.descripcion,
    rubro: perfil.rubro,
    palabrasClave: perfil.palabrasClave,
    categoriasUnspsc: perfil.categoriasUnspsc,
    regionesInteres: perfil.regionesInteres,
    montoMinimo: perfil.montoMinimo !== null ? Number(perfil.montoMinimo) : null,
    montoMaximo: perfil.montoMaximo !== null ? Number(perfil.montoMaximo) : null,
  };
}

export class MatchingLicitacionesService {
  constructor(
    private readonly ollamaClient: OllamaClient,
    private readonly perfilEmpresaRepo: typeof perfilEmpresaRepository,
    private readonly matchingRepo: typeof matchingLicitacionRepository
  ) {}

  /**
   * Decide qué licitaciones se van a matchear y contra qué perfil.
   *
   * Que la validación del perfil viva acá y no en el loop es lo que hace que un batch sin perfil
   * devuelva un 422 por HTTP: antes se lanzaba después del 202 y el error moría en un log, así que
   * el frontend decía "matching iniciado" y no pasaba nada más.
   */
  async planificar(
    seleccion: SeleccionProceso
  ): Promise<PlanProceso<LicitacionParaMatchingPendiente, ContextoMatching>> {
    const perfil = await this.perfilEmpresaRepo.obtener();
    if (!perfil) {
      throw new UnprocessableEntityError("No hay un perfil de empresa configurado", "PERFIL_EMPRESA_REQUERIDO");
    }

    const ctx: ContextoMatching = { perfil: toPerfilParaMatching(perfil), perfilVersion: perfil.version };

    if (seleccion.modo === "IDS") {
      const { listas, sinAnalisis } = await this.matchingRepo.listarPorIds(seleccion.ids);

      const encontradas = [...listas.map((l) => l.id), ...sinAnalisis.map((l) => l.id)];
      const faltantes = seleccion.ids.filter((id) => !encontradas.includes(id));
      if (faltantes.length > 0) {
        throw new NotFoundError(`No existen las licitaciones ${faltantes.join(", ")}`, "LICITACION_NO_ENCONTRADA");
      }

      // Sin análisis no hay con qué matchear, pero eso no invalida al resto de la selección: se
      // reportan como omitidas y las demás se procesan. Si NINGUNA tiene análisis, el runner
      // convierte el primer omitido en el 422 ANALISIS_REQUERIDO de siempre.
      const omitidos: ItemOmitido[] = sinAnalisis.map((l) => ({
        objetoId: l.id,
        etiqueta: l.codigoExterno,
        titulo: l.nombre,
        subtitulo: l.nombreOrganismo,
        motivo: `La licitación ${l.codigoExterno} no tiene un análisis completado todavía`,
        codigo: "ANALISIS_REQUERIDO",
      }));

      return { items: listas, omitidos, ctx, parametros: { modo: "IDS", ids: seleccion.ids } };
    }

    // Solo acota el batch de pendientes; matchear por ids evalúa lo que le pidas.
    const segmentos = segmentosDe(perfil.categoriasUnspsc);
    const items = await this.matchingRepo.listarPendientesActivas(perfil.version, segmentos);

    if (segmentos.length > 0) {
      logger.info({ segmentos, pendientes: items.length }, "Matching acotado a los segmentos UNSPSC del perfil");
    }

    return {
      items,
      omitidos: [],
      ctx,
      parametros: { modo: "PENDIENTES", segmentos, perfilVersion: perfil.version },
    };
  }

  async procesar(
    licitacion: LicitacionParaMatchingPendiente,
    { perfil, perfilVersion }: ContextoMatching,
    opts: OpcionesItem
  ) {
    const inicio = Date.now();
    const prompt = buildMatchingPrompt(perfil, licitacion);

    try {
      const resultado = await this.ollamaClient.generarMatching(prompt, opts);
      const guardado = await this.matchingRepo.guardarCompletado({
        licitacionId: licitacion.id,
        puntaje: resultado.puntaje,
        recomendacion: resultado.recomendacion.toUpperCase() as "SI" | "NO" | "TAL_VEZ",
        justificacion: resultado.justificacion,
        modelo: config.OLLAMA_MODEL,
        promptVersion: MATCHING_PROMPT_VERSION,
        perfilVersion,
        duracionMs: Date.now() - inicio,
      });
      logger.info(
        { codigoExterno: licitacion.codigoExterno, duracionMs: guardado.duracionMs },
        "Matching de licitación completado"
      );
      return guardado;
    } catch (err) {
      // Ver el comentario equivalente en analisisLicitacionesService: una cancelación vuelve a la
      // cola de pendientes, no se persiste como fallo.
      if (err instanceof ProcesoCanceladoError) throw err;

      await this.matchingRepo.guardarFallido({
        licitacionId: licitacion.id,
        modelo: config.OLLAMA_MODEL,
        promptVersion: MATCHING_PROMPT_VERSION,
        perfilVersion,
        duracionMs: Date.now() - inicio,
        detalleError: err instanceof Error ? err.message : String(err),
      });
      logger.error({ err, codigoExterno: licitacion.codigoExterno }, "Matching de licitación falló");
      throw err;
    }
  }
}
