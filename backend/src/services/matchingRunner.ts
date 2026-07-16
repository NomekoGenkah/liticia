import { OllamaClient } from "../clients/ollamaClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { matchingLicitacionRepository } from "../repositories/matchingLicitacionRepository";
import { perfilEmpresaRepository } from "../repositories/perfilEmpresaRepository";
import { licitacionRepository } from "../repositories/licitacionRepository";
import { ConflictError } from "../utils/errors";
import { MatchingLicitacionesService, type MatchingPendientesResumen } from "./matchingLicitacionesService";

let servicio: MatchingLicitacionesService | undefined;

function getMatchingService(): MatchingLicitacionesService {
  if (!servicio) {
    const client = new OllamaClient({
      host: config.OLLAMA_URL,
      model: config.OLLAMA_MODEL,
      timeoutMs: config.OLLAMA_REQUEST_TIMEOUT_MS,
      retryMax: config.OLLAMA_RETRY_MAX,
      retryBaseDelayMs: config.OLLAMA_RETRY_BASE_DELAY_MS,
      think: config.OLLAMA_THINK,
    });

    servicio = new MatchingLicitacionesService(
      client,
      licitacionRepository,
      perfilEmpresaRepository,
      matchingLicitacionRepository
    );
  }

  return servicio;
}

let enProceso = false;

export function estaMatchingEnProceso(): boolean {
  return enProceso;
}

function tomarLock(): void {
  if (enProceso) {
    throw new ConflictError(
      "Ya hay un matching en curso, espera a que termine antes de disparar otro",
      "MATCHING_EN_PROCESO"
    );
  }
  enProceso = true;
}

/** Matchea una licitación puntual, esperando el resultado. Usado por el endpoint individual. */
export async function matchearLicitacion(codigoExterno: string) {
  tomarLock();
  try {
    return await getMatchingService().matchearUna(codigoExterno);
  } finally {
    enProceso = false;
  }
}

/** Dispara el batch en segundo plano y retorna de inmediato. Usado por el endpoint HTTP async. */
export function iniciarMatchingPendientes(): void {
  tomarLock();
  logger.info({}, "Iniciando matching de licitaciones pendientes (background)");

  getMatchingService()
    .matchearPendientes()
    .then((resumen) => logger.info({ ...resumen }, "Batch de matching finalizado"))
    .catch((err) => logger.error({ err }, "Batch de matching falló"))
    .finally(() => {
      enProceso = false;
    });
}

/** Ejecuta el batch y espera el resultado completo. Usado por el script CLI. */
export async function ejecutarMatchingPendientes(): Promise<MatchingPendientesResumen> {
  tomarLock();
  try {
    return await getMatchingService().matchearPendientes();
  } finally {
    enProceso = false;
  }
}
