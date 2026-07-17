import { Router } from "express";
import { licitacionesRouter } from "./licitaciones.routes";
import { healthRouter } from "./health.routes";
import { ingestaRouter } from "./ingesta.routes";
import { perfilEmpresaRouter } from "./perfilEmpresa.routes";
import { estadisticasRouter } from "./estadisticas.routes";
import { procesosRouter } from "./procesos.routes";

export const apiRouter = Router();

apiRouter.use("/licitaciones", licitacionesRouter);
apiRouter.use("/health", healthRouter);
apiRouter.use("/ingesta", ingestaRouter);
// Análisis, matching y embeddings: los tres pasan por acá. Antes eran tres routers idénticos
// (/analisis, /matching, /documentos) con un endpoint de disparo y otro de estado cada uno.
apiRouter.use("/procesos", procesosRouter);
apiRouter.use("/perfil-empresa", perfilEmpresaRouter);
apiRouter.use("/estadisticas", estadisticasRouter);
