import { Router } from "express";
import { estadisticasRepository } from "../repositories/estadisticasRepository";
import { EstadisticasService } from "../services/estadisticasService";

const estadisticasService = new EstadisticasService(estadisticasRepository);

export const estadisticasRouter = Router();

estadisticasRouter.get("/panel", async (_req, res, next) => {
  try {
    res.json(await estadisticasService.obtenerPanel());
  } catch (err) {
    next(err);
  }
});
