import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../config/logger";
import type { documentoLicitacionRepository } from "../repositories/documentoLicitacionRepository";
import type { licitacionRepository } from "../repositories/licitacionRepository";
import { NotFoundError, UnprocessableEntityError } from "../utils/errors";
import { absoluteStoragePath, ensureDocumentosDir } from "../utils/storage";
import { extraerTexto, type TipoParser } from "./documentoExtractor";

const TIPOS_PERMITIDOS: Record<string, { mimeType: string; parser: TipoParser }> = {
  ".pdf": { mimeType: "application/pdf", parser: "pdf" },
  ".docx": {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    parser: "docx",
  },
  ".xlsx": {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    parser: "xlsx",
  },
};

export class DocumentosLicitacionService {
  constructor(
    private readonly licitacionRepo: typeof licitacionRepository,
    private readonly documentoRepo: typeof documentoLicitacionRepository
  ) {}

  async subir(codigoExterno: string, file: Express.Multer.File) {
    const licitacion = await this.licitacionRepo.findByCodigoExterno(codigoExterno, false);
    if (!licitacion) throw new NotFoundError(`No existe la licitación ${codigoExterno}`);

    const extension = path.extname(file.originalname).toLowerCase();
    const tipo = TIPOS_PERMITIDOS[extension];
    if (!tipo) {
      throw new UnprocessableEntityError(
        `Tipo de archivo no soportado (${extension || "sin extensión"}). Solo se aceptan PDF, DOCX y XLSX.`,
        "TIPO_ARCHIVO_NO_SOPORTADO"
      );
    }

    const documentoId = randomUUID();
    const dirRelativo = ensureDocumentosDir(licitacion.id);
    const rutaRelativa = path.join(dirRelativo, `${documentoId}${extension}`);
    await fs.writeFile(absoluteStoragePath(rutaRelativa), file.buffer);

    let estadoExtraccion: "COMPLETADO" | "FALLIDO";
    let textoExtraido: string | null = null;
    let detalleError: string | null = null;

    try {
      textoExtraido = await extraerTexto(file.buffer, tipo.parser);
      estadoExtraccion = "COMPLETADO";
    } catch (err) {
      estadoExtraccion = "FALLIDO";
      detalleError = err instanceof Error ? err.message : String(err);
      logger.warn({ err, codigoExterno, nombreArchivo: file.originalname }, "Extracción de texto falló");
    }

    return this.documentoRepo.crear({
      id: documentoId,
      licitacionId: licitacion.id,
      nombreArchivo: file.originalname,
      mimeType: tipo.mimeType,
      tamañoBytes: file.size,
      rutaAlmacenamiento: rutaRelativa,
      textoExtraido,
      estadoExtraccion,
      detalleError,
    });
  }

  async listar(codigoExterno: string) {
    const licitacion = await this.licitacionRepo.findByCodigoExterno(codigoExterno, false);
    if (!licitacion) throw new NotFoundError(`No existe la licitación ${codigoExterno}`);
    return this.documentoRepo.listarPorLicitacion(licitacion.id);
  }

  async eliminar(codigoExterno: string, documentoId: string) {
    const licitacion = await this.licitacionRepo.findByCodigoExterno(codigoExterno, false);
    if (!licitacion) throw new NotFoundError(`No existe la licitación ${codigoExterno}`);

    const documento = await this.documentoRepo.obtenerDeLicitacion(licitacion.id, documentoId);
    if (!documento) throw new NotFoundError(`No existe el documento ${documentoId}`, "DOCUMENTO_NO_ENCONTRADO");

    await this.documentoRepo.eliminar(documentoId);

    try {
      await fs.unlink(absoluteStoragePath(documento.rutaAlmacenamiento));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ err, documentoId }, "No se pudo borrar el archivo en disco (fila ya eliminada de la BD)");
      }
    }
  }
}
