import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { PayloadTooLargeError, UnprocessableEntityError } from "../utils/errors";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

/**
 * Se invoca multer manualmente (en vez de pasarlo como middleware directo a la ruta) para poder
 * interceptar el MulterError aquí y traducirlo a un AppError — si no, llegaría al errorHandler
 * genérico como error no-AppError y respondería 500 INTERNAL_ERROR, perdiendo el detalle real
 * (ej. archivo demasiado grande).
 */
export function uploadDocumentoMiddleware(
  req: Request<{ codigoExterno: string }>,
  res: Response,
  next: NextFunction
): void {
  upload.single("archivo")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new PayloadTooLargeError("El archivo supera el límite de 20MB", "ARCHIVO_DEMASIADO_GRANDE"));
        return;
      }
      next(new UnprocessableEntityError(`No se pudo procesar el archivo: ${err.message}`, "ARCHIVO_INVALIDO"));
      return;
    }
    if (err) {
      next(err);
      return;
    }
    next();
  });
}
