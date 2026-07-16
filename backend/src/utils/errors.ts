import type { NextFunction, Request, Response } from "express";
import { logger } from "../config/logger";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class ChileCompraApiError extends AppError {
  constructor(message: string) {
    super(message, 502, "CHILECOMPRA_API_ERROR");
  }
}

export class ApiRateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, "CHILECOMPRA_RATE_LIMIT");
  }
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn({ err, path: req.path, code: err.code }, "Request finalizó con error controlado");
    res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
    return;
  }

  logger.error({ err, path: req.path }, "Error no controlado");
  res.status(500).json({ error: { message: "Error interno del servidor", code: "INTERNAL_ERROR" } });
}
