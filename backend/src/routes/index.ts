import { Router } from "express";
import { licitacionesRouter } from "./licitaciones.routes";
import { healthRouter } from "./health.routes";

export const apiRouter = Router();

apiRouter.use("/licitaciones", licitacionesRouter);
apiRouter.use("/health", healthRouter);
