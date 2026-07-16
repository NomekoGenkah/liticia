import type { OllamaClient } from "../clients/ollamaClient";
import type { LicitacionParaAnalisis } from "../clients/ollamaClient.types";
import { config } from "../config/env";
import { logger } from "../config/logger";
import type {
  analisisLicitacionRepository,
  LicitacionPendiente,
} from "../repositories/analisisLicitacionRepository";
import type { licitacionRepository } from "../repositories/licitacionRepository";
import { NotFoundError } from "../utils/errors";
import { buildAnalisisPrompt, PROMPT_VERSION } from "./analisisPrompt";

export interface AnalisisPendientesResumen {
  totalEncontradas: number;
  totalCompletadas: number;
  totalFallidas: number;
}

interface LicitacionParaProcesar extends LicitacionParaAnalisis {
  id: string;
  codigoExterno: string;
}

export class AnalisisLicitacionesService {
  constructor(
    private readonly ollamaClient: OllamaClient,
    private readonly licitacionRepo: typeof licitacionRepository,
    private readonly analisisRepo: typeof analisisLicitacionRepository
  ) {}

  async analizarUna(codigoExterno: string) {
    const licitacion = await this.licitacionRepo.findByCodigoExterno(codigoExterno, false);
    if (!licitacion) throw new NotFoundError(`No existe la licitación ${codigoExterno}`);

    return this.procesar({
      id: licitacion.id,
      codigoExterno: licitacion.codigoExterno,
      nombre: licitacion.nombre,
      descripcion: licitacion.descripcion,
      nombreOrganismo: licitacion.nombreOrganismo,
      montoEstimado: licitacion.montoEstimado ? Number(licitacion.montoEstimado) : null,
      moneda: licitacion.moneda,
      tipo: licitacion.tipo,
      fechaPublicacion: licitacion.fechaPublicacion,
      fechaCierre: licitacion.fechaCierre,
      items: licitacion.items,
    });
  }

  async analizarPendientes(): Promise<AnalisisPendientesResumen> {
    const pendientes = await this.analisisRepo.listarPendientesActivas();
    const resumen: AnalisisPendientesResumen = {
      totalEncontradas: pendientes.length,
      totalCompletadas: 0,
      totalFallidas: 0,
    };

    for (const licitacion of pendientes) {
      try {
        await this.procesar(licitacion);
        resumen.totalCompletadas++;
      } catch (err) {
        resumen.totalFallidas++;
        logger.error({ err, codigoExterno: licitacion.codigoExterno }, "Análisis individual falló dentro del batch");
      }
    }

    logger.info({ ...resumen }, "Batch de análisis de pendientes finalizado");
    return resumen;
  }

  private async procesar(licitacion: LicitacionParaProcesar | LicitacionPendiente) {
    const inicio = Date.now();
    const prompt = buildAnalisisPrompt(licitacion);

    try {
      const resultado = await this.ollamaClient.generarAnalisis(prompt);
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
