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
    const documento = await prisma.licitacionDocumento.create({
      data: input,
      omit: { rutaAlmacenamiento: true },
    });

    // Recién subido: los chunks se generan aparte, con el batch de embeddings.
    return { ...documento, chunksCount: 0 };
  },

  async listarPorLicitacion(licitacionId: string) {
    const documentos = await prisma.licitacionDocumento.findMany({
      where: { licitacionId },
      orderBy: { fechaCarga: "desc" },
      omit: { rutaAlmacenamiento: true },
      include: { _count: { select: { chunks: true } } },
    });

    return documentos.map(({ _count, ...documento }) => ({ ...documento, chunksCount: _count.chunks }));
  },

  /** Uso interno (borrado): sí necesita rutaAlmacenamiento para poder borrar el archivo en disco. */
  async obtenerDeLicitacion(licitacionId: string, id: string) {
    return prisma.licitacionDocumento.findFirst({ where: { id, licitacionId } });
  },

  async eliminar(id: string) {
    return prisma.licitacionDocumento.delete({ where: { id } });
  },
};
