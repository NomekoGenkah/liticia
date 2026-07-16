import type { OllamaClient } from "../clients/ollamaClient";
import type { LicitacionParaMatching, PerfilEmpresaParaMatching } from "../clients/ollamaClient.types";
import { config } from "../config/env";
import { logger } from "../config/logger";
import type {
  matchingLicitacionRepository,
  LicitacionParaMatchingPendiente,
} from "../repositories/matchingLicitacionRepository";
import type { perfilEmpresaRepository } from "../repositories/perfilEmpresaRepository";
import type { licitacionRepository } from "../repositories/licitacionRepository";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors";
import { buildMatchingPrompt, MATCHING_PROMPT_VERSION } from "./matchingPrompt";

export interface MatchingPendientesResumen {
  totalEncontradas: number;
  totalCompletadas: number;
  totalFallidas: number;
}

interface LicitacionParaProcesar extends LicitacionParaMatching {
  id: string;
  codigoExterno: string;
}

function toPerfilParaMatching(perfil: {
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
    private readonly licitacionRepo: typeof licitacionRepository,
    private readonly perfilEmpresaRepo: typeof perfilEmpresaRepository,
    private readonly matchingRepo: typeof matchingLicitacionRepository
  ) {}

  async matchearUna(codigoExterno: string) {
    const licitacion = await this.licitacionRepo.findByCodigoExterno(codigoExterno, false);
    if (!licitacion) throw new NotFoundError(`No existe la licitación ${codigoExterno}`);

    if (licitacion.analisis?.estado !== "COMPLETADO") {
      throw new UnprocessableEntityError(
        `La licitación ${codigoExterno} no tiene un análisis completado todavía`,
        "ANALISIS_REQUERIDO"
      );
    }

    const perfil = await this.perfilEmpresaRepo.obtener();
    if (!perfil) {
      throw new UnprocessableEntityError("No hay un perfil de empresa configurado", "PERFIL_EMPRESA_REQUERIDO");
    }

    return this.procesar(
      {
        id: licitacion.id,
        codigoExterno: licitacion.codigoExterno,
        nombre: licitacion.nombre,
        nombreOrganismo: licitacion.nombreOrganismo,
        montoEstimado: licitacion.montoEstimado ? Number(licitacion.montoEstimado) : null,
        moneda: licitacion.moneda,
        regionUnidad: licitacion.regionUnidad,
        tipo: licitacion.tipo,
        fechaCierre: licitacion.fechaCierre,
        analisis: {
          resumenEjecutivo: licitacion.analisis.resumenEjecutivo,
          puntosClave: licitacion.analisis.puntosClave,
          palabrasClave: licitacion.analisis.palabrasClave,
          nivelComplejidad: licitacion.analisis.nivelComplejidad,
        },
      },
      toPerfilParaMatching(perfil),
      perfil.version
    );
  }

  async matchearPendientes(): Promise<MatchingPendientesResumen> {
    const perfil = await this.perfilEmpresaRepo.obtener();
    if (!perfil) {
      throw new UnprocessableEntityError("No hay un perfil de empresa configurado", "PERFIL_EMPRESA_REQUERIDO");
    }

    const perfilParaMatching = toPerfilParaMatching(perfil);
    const pendientes = await this.matchingRepo.listarPendientesActivas(perfil.version);
    const resumen: MatchingPendientesResumen = {
      totalEncontradas: pendientes.length,
      totalCompletadas: 0,
      totalFallidas: 0,
    };

    for (const licitacion of pendientes) {
      try {
        await this.procesar(licitacion, perfilParaMatching, perfil.version);
        resumen.totalCompletadas++;
      } catch (err) {
        resumen.totalFallidas++;
        logger.error({ err, codigoExterno: licitacion.codigoExterno }, "Matching individual falló dentro del batch");
      }
    }

    logger.info({ ...resumen }, "Batch de matching de pendientes finalizado");
    return resumen;
  }

  private async procesar(
    licitacion: LicitacionParaProcesar | LicitacionParaMatchingPendiente,
    perfil: PerfilEmpresaParaMatching,
    perfilVersion: number
  ) {
    const inicio = Date.now();
    const prompt = buildMatchingPrompt(perfil, licitacion);

    try {
      const resultado = await this.ollamaClient.generarMatching(prompt);
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
