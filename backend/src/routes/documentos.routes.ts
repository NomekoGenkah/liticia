import { Router } from "express";
import { estaEmbeddingEnProceso, iniciarEmbeddingPendientes } from "../services/embeddingRunner";

export const documentosRouter = Router();

documentosRouter.post("/pendientes", (_req, res, next) => {
  try {
    iniciarEmbeddingPendientes();
    res.status(202).json({ enProceso: true });
  } catch (err) {
    next(err);
  }
});

documentosRouter.get("/estado", (_req, res) => {
  res.json({ enProceso: estaEmbeddingEnProceso() });
});
