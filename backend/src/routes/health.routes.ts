import { Router } from "express";
import { prisma } from "../config/prisma";
import { config } from "../config/env";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let dbStatus: "ok" | "error" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const contadorHoy = await prisma.apiRequestCounter.findUnique({ where: { fecha: hoy } });

  res.json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    db: dbStatus,
    requestsHoyChileCompra: contadorHoy?.contador ?? 0,
    limiteDiario: contadorHoy?.limiteDiario ?? config.CHILECOMPRA_MAX_REQUESTS_DIA,
  });
});
