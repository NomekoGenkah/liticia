import { Router } from "express";
import { z } from "zod";
import { licitacionRepository } from "../repositories/licitacionRepository";
import { analizarLicitacion } from "../services/analisisRunner";
import { matchearLicitacion } from "../services/matchingRunner";
import { LicitacionQueryService, parseOrderBy } from "../services/licitacionQueryService";
import { paginationSchema } from "../utils/pagination";

const queryService = new LicitacionQueryService(licitacionRepository);

const listQuerySchema = paginationSchema.extend({
  estado: z.string().optional(),
  codigoOrganismo: z.string().optional(),
  fechaCierreDesde: z.coerce.date().optional(),
  fechaCierreHasta: z.coerce.date().optional(),
  orderBy: z.string().optional(),
});

export const licitacionesRouter = Router();

licitacionesRouter.get("/", async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const orderBy = parseOrderBy(query.orderBy);

    const result = await queryService.listar(
      {
        estado: query.estado,
        codigoOrganismo: query.codigoOrganismo,
        fechaCierreDesde: query.fechaCierreDesde,
        fechaCierreHasta: query.fechaCierreHasta,
      },
      orderBy,
      { page: query.page, pageSize: query.pageSize }
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

licitacionesRouter.get("/:codigoExterno", async (req, res, next) => {
  try {
    const includeRaw = req.query.raw === "true";
    const licitacion = await queryService.obtenerDetalle(req.params.codigoExterno, includeRaw);
    res.json(licitacion);
  } catch (err) {
    next(err);
  }
});

licitacionesRouter.post("/:codigoExterno/analisis", async (req, res, next) => {
  try {
    const resultado = await analizarLicitacion(req.params.codigoExterno);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

licitacionesRouter.post("/:codigoExterno/matching", async (req, res, next) => {
  try {
    const resultado = await matchearLicitacion(req.params.codigoExterno);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});
