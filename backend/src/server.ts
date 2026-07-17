import { createApp } from "./app";
import { config } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { iniciarScheduler } from "./jobs/scheduler";
import { procesoRunRepository } from "./repositories/procesoRunRepository";

/**
 * Un run EN_PROCESO en la base cuando el servidor recién arranca solo puede significar que el
 * proceso anterior murió a mitad: el estado vivo era memoria y se fue con él. Se cierran como
 * INTERRUMPIDO (distinto de FALLIDO: nadie falló, se cayó el backend) para que el historial diga
 * la verdad y el lock en base no quede tomado para siempre.
 *
 * Asume una sola instancia de backend, que es lo que esta app es. Con dos, el arranque de una
 * mataría el run vivo de la otra. Por eso mismo esto va acá y no en los jobs del CLI.
 */
async function limpiarRunsHuerfanos() {
  try {
    const huerfanos = await procesoRunRepository.cerrarHuerfanos();
    if (huerfanos > 0) {
      logger.warn({ huerfanos }, "Runs marcados INTERRUMPIDO: el backend se reinició mientras corrían");
    }
  } catch (err) {
    // No es fatal: el servidor tiene que levantar igual. A lo sumo un run viejo se ve EN_PROCESO
    // en el historial y bloquea el lock hasta el próximo arranque.
    logger.error({ err }, "No se pudieron limpiar los runs huérfanos");
  }
}

async function main() {
  await limpiarRunsHuerfanos();

  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "LicitIA backend escuchando");
  });

  // El default de Node (300s) corta cualquier request que dure más, y el stream SSE de /api/procesos
  // dura lo que dure el batch — que con un modelo local son horas. Sin esto, el panel en vivo se
  // congela a los 5 minutos exactos sin un solo error en los logs.
  server.requestTimeout = 0;

  const scheduler = iniciarScheduler();

  function shutdown(signal: string) {
    logger.info({ signal }, "Apagando servidor");
    scheduler.detener();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "El backend no pudo arrancar");
  process.exit(1);
});
