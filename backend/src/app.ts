import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./config/logger";
import { apiRouter } from "./routes";
import { errorHandler } from "./utils/errors";

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use("/api", apiRouter);

  app.use(errorHandler);

  return app;
}
