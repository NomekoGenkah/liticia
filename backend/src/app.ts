import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./config/logger";
import { apiRouter } from "./routes";
import { errorHandler } from "./utils/errors";

export function createApp() {
  const app = express();

  app.use(
    pinoHttp({
      logger,
      // pino-http loguea al terminar la respuesta, y el stream de eventos no termina nunca (dura lo
      // que dure la pestaña abierta): sin esto, cada conexión SSE queda como una request colgada
      // que solo se loguea al cerrarse, horas después y con un tiempo de respuesta absurdo.
      autoLogging: { ignore: (req) => req.url === "/api/procesos/eventos" },
    })
  );
  app.use(express.json());

  // Ojo: nada de `compression` acá. Un middleware de compresión buffe­rea la respuesta y congelaría
  // el stream SSE de /api/procesos/eventos sin un solo error en los logs. Si alguna vez hace falta,
  // tiene que excluir esa ruta (el handler ya manda `Cache-Control: no-transform` como respaldo).

  app.use("/api", apiRouter);

  app.use(errorHandler);

  return app;
}
