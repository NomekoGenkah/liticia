import { Router } from "express";
import { z } from "zod";
import { perfilEmpresaRepository } from "../repositories/perfilEmpresaRepository";
import { PerfilEmpresaService } from "../services/perfilEmpresaService";

const perfilEmpresaService = new PerfilEmpresaService(perfilEmpresaRepository);

const guardarBodySchema = z.object({
  tipo: z.enum(["EMPRESA", "PERSONA_NATURAL"]).default("EMPRESA"),
  nombre: z.string().min(1),
  descripcion: z.string().min(1),
  rubro: z.string().optional(),
  palabrasClave: z.array(z.string()).optional().default([]),
  categoriasUnspsc: z.array(z.string()).optional().default([]),
  regionesInteres: z.array(z.string()).optional().default([]),
  montoMinimo: z.coerce.number().nonnegative().optional(),
  montoMaximo: z.coerce.number().nonnegative().optional(),
});

export const perfilEmpresaRouter = Router();

perfilEmpresaRouter.get("/", async (_req, res, next) => {
  try {
    const perfil = await perfilEmpresaService.obtener();
    res.json(perfil);
  } catch (err) {
    next(err);
  }
});

perfilEmpresaRouter.put("/", async (req, res, next) => {
  try {
    const body = guardarBodySchema.parse(req.body ?? {});
    const perfil = await perfilEmpresaService.guardar({
      tipo: body.tipo,
      nombre: body.nombre,
      descripcion: body.descripcion,
      rubro: body.rubro ?? null,
      palabrasClave: body.palabrasClave,
      categoriasUnspsc: body.categoriasUnspsc,
      regionesInteres: body.regionesInteres,
      montoMinimo: body.montoMinimo ?? null,
      montoMaximo: body.montoMaximo ?? null,
    });
    res.json(perfil);
  } catch (err) {
    next(err);
  }
});
