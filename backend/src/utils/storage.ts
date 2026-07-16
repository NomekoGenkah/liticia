import fs from "node:fs";
import path from "node:path";
import { config } from "../config/env";

const REPO_ROOT = path.resolve(__dirname, "../../../");

export function absoluteStoragePath(rutaRelativa: string): string {
  return path.resolve(REPO_ROOT, rutaRelativa);
}

/** Crea (si no existe) storage/documentos/{licitacionId} y devuelve la ruta relativa al repo. */
export function ensureDocumentosDir(licitacionId: string): string {
  const relativa = path.join(config.STORAGE_DOCUMENTOS_DIR, licitacionId);
  fs.mkdirSync(absoluteStoragePath(relativa), { recursive: true });
  return relativa;
}
