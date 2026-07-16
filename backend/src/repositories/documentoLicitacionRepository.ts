import { prisma } from "../config/prisma";

export interface DocumentoCrearInput {
  id: string;
  licitacionId: string;
  nombreArchivo: string;
  mimeType: string;
  tamañoBytes: number;
  rutaAlmacenamiento: string;
  textoExtraido: string | null;
  estadoExtraccion: "COMPLETADO" | "FALLIDO";
  detalleError: string | null;
}

export const documentoLicitacionRepository = {
  async crear(input: DocumentoCrearInput) {
    return prisma.licitacionDocumento.create({
      data: input,
      omit: { rutaAlmacenamiento: true },
    });
  },

  async listarPorLicitacion(licitacionId: string) {
    return prisma.licitacionDocumento.findMany({
      where: { licitacionId },
      orderBy: { fechaCarga: "desc" },
      omit: { rutaAlmacenamiento: true },
    });
  },

  /** Uso interno (borrado): sí necesita rutaAlmacenamiento para poder borrar el archivo en disco. */
  async obtenerDeLicitacion(licitacionId: string, id: string) {
    return prisma.licitacionDocumento.findFirst({ where: { id, licitacionId } });
  },

  async eliminar(id: string) {
    return prisma.licitacionDocumento.delete({ where: { id } });
  },
};
