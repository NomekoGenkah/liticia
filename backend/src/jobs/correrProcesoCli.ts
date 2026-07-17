import { logger } from "../config/logger";
import { getRunner } from "../services/procesos/registry";
import type { ProcesoTipo } from "../types/procesos";

/**
 * Corre un proceso de IA completo desde la línea de comandos y termina el proceso.
 *
 * Los tres jobs (analyze/match/embed) eran el mismo archivo con otro import; ahora solo difieren en
 * el tipo. Ojo con lo que NO hace: no barre runs huérfanos. Eso va solo en el arranque del
 * servidor — si un job del CLI barriera al arrancar, se llevaría puesto el run vivo del backend.
 */
export function correrProcesoCli(tipo: ProcesoTipo, etiqueta: string): void {
  const runner = getRunner(tipo);

  // Ctrl+C cierra el run como CANCELADO en vez de dejarlo EN_PROCESO para siempre.
  process.on("SIGINT", () => {
    logger.warn({ tipo }, "SIGINT recibido: cancelando el run en curso");
    runner.cancelar();
  });

  logger.info({}, `Iniciando ${etiqueta}`);

  runner
    .ejecutar({ modo: "PENDIENTES" }, "CLI")
    .then((resumen) => {
      logger.info({ resumen }, `${etiqueta} finalizado`);
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, `${etiqueta} falló`);
      process.exit(1);
    });
}
