import { Router } from "express";
import { z } from "zod";
import { ingestaRunRepository } from "../repositories/ingestaRunRepository";
import { ejecutarIngesta, estaEnProceso } from "../services/ingestaRunner";
import { paginationSchema } from "../utils/pagination";

const estadoFiltroSchema = z.enum([
  "publicada",
  "cerrada",
  "desierta",
  "adjudicada",
  "revocada",
  "suspendida",
  "todos",
  "activas",
]);

const ejecutarBodySchema = z.object({
  fecha: z.coerce.date().optional(),
  estado: estadoFiltroSchema.optional(),
  codigoOrganismo: z.string().optional(),
  codigoProveedor: z.string().optional(),
});

export const ingestaRouter = Router();

ingestaRouter.post("/ejecutar", async (req, res, next) => {
  try {
    const filtros = ejecutarBodySchema.parse(req.body ?? {});
    const resumen = await ejecutarIngesta(filtros, { disparadoPor: "MANUAL" });
    res.json(resumen);
  } catch (err) {
    next(err);
  }
});

ingestaRouter.get("/estado", (_req, res) => {
  res.json({ enProceso: estaEnProceso() });
});

ingestaRouter.get("/runs", async (req, res, next) => {
  try {
    const pagination = paginationSchema.parse(req.query);
    const result = await ingestaRunRepository.listar(pagination);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
