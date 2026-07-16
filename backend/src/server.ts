import { createApp } from "./app";
import { config } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "LicitIA backend escuchando");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Apagando servidor");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
