import { Router } from "express";
import { licitacionesRouter } from "./licitaciones.routes";
import { healthRouter } from "./health.routes";
import { ingestaRouter } from "./ingesta.routes";
import { analisisRouter } from "./analisis.routes";
import { matchingRouter } from "./matching.routes";
import { perfilEmpresaRouter } from "./perfilEmpresa.routes";
import { documentosRouter } from "./documentos.routes";
import { estadisticasRouter } from "./estadisticas.routes";

export const apiRouter = Router();

apiRouter.use("/licitaciones", licitacionesRouter);
apiRouter.use("/health", healthRouter);
apiRouter.use("/ingesta", ingestaRouter);
apiRouter.use("/analisis", analisisRouter);
apiRouter.use("/matching", matchingRouter);
apiRouter.use("/perfil-empresa", perfilEmpresaRouter);
apiRouter.use("/documentos", documentosRouter);
apiRouter.use("/estadisticas", estadisticasRouter);
