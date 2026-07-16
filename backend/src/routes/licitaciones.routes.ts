import { Router } from "express";
import { z } from "zod";
import { licitacionRepository } from "../repositories/licitacionRepository";
import { documentoLicitacionRepository } from "../repositories/documentoLicitacionRepository";
import { analizarLicitacion } from "../services/analisisRunner";
import { matchearLicitacion } from "../services/matchingRunner";
import { DocumentosLicitacionService } from "../services/documentosLicitacionService";
import { LicitacionQueryService, parseOrderBy } from "../services/licitacionQueryService";
import { paginationSchema } from "../utils/pagination";
import { UnprocessableEntityError } from "../utils/errors";
import { uploadDocumentoMiddleware } from "./documentos.middleware";

const queryService = new LicitacionQueryService(licitacionRepository);
const documentosService = new DocumentosLicitacionService(licitacionRepository, documentoLicitacionRepository);

const listQuerySchema = paginationSchema.extend({
  estado: z.string().optional(),
  codigoOrganismo: z.string().optional(),
  fechaCierreDesde: z.coerce.date().optional(),
  fechaCierreHasta: z.coerce.date().optional(),
  orderBy: z.string().optional(),
  recomendacion: z.enum(["SI", "NO", "TAL_VEZ"]).optional(),
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
        recomendacion: query.recomendacion,
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

licitacionesRouter.post("/:codigoExterno/documentos", uploadDocumentoMiddleware, async (req, res, next) => {
  try {
    if (!req.file) {
      throw new UnprocessableEntityError("Debes adjuntar un archivo", "ARCHIVO_REQUERIDO");
    }
    const documento = await documentosService.subir(req.params.codigoExterno, req.file);
    res.status(201).json(documento);
  } catch (err) {
    next(err);
  }
});

licitacionesRouter.get("/:codigoExterno/documentos", async (req, res, next) => {
  try {
    const documentos = await documentosService.listar(req.params.codigoExterno);
    res.json(documentos);
  } catch (err) {
    next(err);
  }
});

licitacionesRouter.delete("/:codigoExterno/documentos/:id", async (req, res, next) => {
  try {
    await documentosService.eliminar(req.params.codigoExterno, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
