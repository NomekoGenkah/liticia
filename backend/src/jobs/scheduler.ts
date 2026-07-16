import cron from "node-cron";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { ejecutarIngesta } from "../services/ingestaRunner";

/**
 * SCHEDULE_VALUE en modo "cron" es una expresión cron de 5 campos (ej. "0 2 * * *").
 * En modo "interval" es un número de milisegundos como string (ej. "3600000" = 1 hora).
 */

export interface SchedulerHandle {
  detener: () => void;
}

async function correrIngestaProgramada(): Promise<void> {
  try {
    await ejecutarIngesta({ estado: "activas" }, { disparadoPor: "CRON" });
  } catch (err) {
    logger.error({ err }, "Ingesta programada falló o fue omitida");
  }
}

export function iniciarScheduler(): SchedulerHandle {
  if (config.SCHEDULE_MODE === "cron") {
    if (!cron.validate(config.SCHEDULE_VALUE)) {
      throw new Error(`SCHEDULE_VALUE inválido para modo cron: "${config.SCHEDULE_VALUE}"`);
    }

    const task = cron.schedule(config.SCHEDULE_VALUE, correrIngestaProgramada);
    logger.info({ cronExpression: config.SCHEDULE_VALUE }, "Scheduler iniciado en modo cron");

    return { detener: () => task.stop() };
  }

  const ms = Number.parseInt(config.SCHEDULE_VALUE, 10);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(`SCHEDULE_VALUE inválido para modo interval (se espera un entero positivo en ms): "${config.SCHEDULE_VALUE}"`);
  }

  const timer = setInterval(correrIngestaProgramada, ms);
  logger.info({ intervalMs: ms }, "Scheduler iniciado en modo interval");

  return { detener: () => clearInterval(timer) };
}
