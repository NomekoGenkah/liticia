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
  constructor(message: string, code: string = "NOT_FOUND") {
    super(message, 404, code);
  }
}

export class ChileCompraApiError extends AppError {
  constructor(message: string) {
    super(message, 502, "CHILECOMPRA_API_ERROR");
  }
}

/**
 * Tope propio de requests diarias, no un rechazo de ChileCompra: lo lanza el guardarraíl local
 * antes de salir a la red. Por eso el código no dice "CHILECOMPRA" — culpar a la API de un límite
 * que se puso uno mismo manda a depurar al lugar equivocado.
 */
export class ApiRateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, "LIMITE_LOCAL_REQUESTS");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = "CONFLICT") {
    super(message, 409, code);
  }
}

export class OllamaApiError extends AppError {
  constructor(message: string) {
    super(message, 502, "OLLAMA_API_ERROR");
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string, code: string = "UNPROCESSABLE_ENTITY") {
    super(message, 422, code);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string, code: string = "PAYLOAD_TOO_LARGE") {
    super(message, 413, code);
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
