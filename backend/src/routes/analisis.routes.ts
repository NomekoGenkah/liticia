import { Router } from "express";
import { estaAnalisisEnProceso, iniciarAnalisisPendientes } from "../services/analisisRunner";

export const analisisRouter = Router();

analisisRouter.post("/pendientes", (_req, res, next) => {
  try {
    iniciarAnalisisPendientes();
    res.status(202).json({ enProceso: true });
  } catch (err) {
    next(err);
  }
});

analisisRouter.get("/estado", (_req, res) => {
  res.json({ enProceso: estaAnalisisEnProceso() });
});
