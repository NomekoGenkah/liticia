import { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { analisisLicitacionRepository } from "../repositories/analisisLicitacionRepository";
import { licitacionRepository } from "../repositories/licitacionRepository";
import { perfilEmpresaRepository } from "../repositories/perfilEmpresaRepository";
import { ConflictError } from "../utils/errors";
import { AnalisisLicitacionesService, type AnalisisPendientesResumen } from "./analisisLicitacionesService";

let servicio: AnalisisLicitacionesService | undefined;

function getAnalisisService(): AnalisisLicitacionesService {
  if (!servicio) {
    const client = new OllamaClient({
      host: config.OLLAMA_URL,
      model: config.OLLAMA_MODEL,
      timeoutMs: config.OLLAMA_REQUEST_TIMEOUT_MS,
      retryMax: config.OLLAMA_RETRY_MAX,
      retryBaseDelayMs: config.OLLAMA_RETRY_BASE_DELAY_MS,
      think: config.OLLAMA_THINK,
    });

    servicio = new AnalisisLicitacionesService(
      client,
      licitacionRepository,
      analisisLicitacionRepository,
      perfilEmpresaRepository
    );
  }

  return servicio;
}

let enProceso = false;

export function estaAnalisisEnProceso(): boolean {
  return enProceso;
}

function tomarLock(): void {
  if (enProceso) {
    throw new ConflictError(
      "Ya hay un análisis en curso, espera a que termine antes de disparar otro",
      "ANALISIS_EN_PROCESO"
    );
  }
  enProceso = true;
}

/** Analiza una licitación puntual, esperando el resultado. Usado por el endpoint individual. */
export async function analizarLicitacion(codigoExterno: string) {
  tomarLock();
  try {
    return await getAnalisisService().analizarUna(codigoExterno);
  } finally {
    enProceso = false;
  }
}

/** Dispara el batch en segundo plano y retorna de inmediato. Usado por el endpoint HTTP async. */
export function iniciarAnalisisPendientes(): void {
  tomarLock();
  logger.info({}, "Iniciando análisis de licitaciones pendientes (background)");

  getAnalisisService()
    .analizarPendientes()
    .then((resumen) => logger.info({ ...resumen }, "Batch de análisis finalizado"))
    .catch((err) => logger.error({ err }, "Batch de análisis falló"))
    .finally(() => {
      enProceso = false;
    });
}

/** Ejecuta el batch y espera el resultado completo. Usado por el script CLI. */
export async function ejecutarAnalisisPendientes(): Promise<AnalisisPendientesResumen> {
  tomarLock();
  try {
    return await getAnalisisService().analizarPendientes();
  } finally {
    enProceso = false;
  }
}
