import { Router } from "express";
import { estaMatchingEnProceso, iniciarMatchingPendientes } from "../services/matchingRunner";

export const matchingRouter = Router();

matchingRouter.post("/pendientes", (_req, res, next) => {
  try {
    iniciarMatchingPendientes();
    res.status(202).json({ enProceso: true });
  } catch (err) {
    next(err);
  }
});

matchingRouter.get("/estado", (_req, res) => {
  res.json({ enProceso: estaMatchingEnProceso() });
});
