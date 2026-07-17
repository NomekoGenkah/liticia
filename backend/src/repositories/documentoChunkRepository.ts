import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma";

export interface ChunkInsertInput {
  documentoId: string;
  licitacionId: string;
  contenido: string;
  chunkIndex: number;
  embedding: number[];
  modelo: string;
}

export interface ChunkSimilar {
  id: string;
  documentoId: string;
  nombreArchivo: string;
  chunkIndex: number;
  contenido: string;
  similitud: number;
}

export interface DocumentoPendienteEmbedding {
  id: string;
  licitacionId: string;
  codigoExterno: string;
  nombreArchivo: string;
  textoExtraido: string;
}

/** pgvector espera el literal `[0.1,0.2,...]`. Siempre se pasa como parámetro, nunca interpolado. */
function aVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export const documentoChunkRepository = {
  /**
   * Borra y reinserta los chunks del documento en una transacción, para que re-embeber sea
   * idempotente y no choque con el unique (documentoId, chunkIndex).
   *
   * Va por $executeRaw porque `embedding` es un campo Unsupported: Prisma no lo expone en el input
   * de create() y la columna es NOT NULL sin default.
   */
  async reemplazarChunksDeDocumento(documentoId: string, chunks: ChunkInsertInput[]) {
    return prisma.$transaction([
      prisma.licitacionDocumentoChunk.deleteMany({ where: { documentoId } }),
      ...chunks.map(
        (chunk) => prisma.$executeRaw`
          INSERT INTO "LicitacionDocumentoChunk"
            ("id", "documentoId", "licitacionId", "contenido", "chunkIndex", "embedding", "modelo", "generadoEn")
          VALUES (
            ${randomUUID()},
            ${chunk.documentoId},
            ${chunk.licitacionId},
            ${chunk.contenido},
            ${chunk.chunkIndex},
            ${aVectorLiteral(chunk.embedding)}::vector,
            ${chunk.modelo},
            NOW()
          )
        `
      ),
    ]);
  },

  /**
   * Los k chunks más parecidos a la pregunta, dentro de una licitación.
   *
   * `<=>` es distancia coseno (0 = idéntico, 2 = opuesto), así que se ordena ascendente y la
   * similitud es `1 - distancia`. No hay índice vectorial a propósito: el filtro por licitacionId
   * ya deja decenas de filas, sobre las que este scan es exacto y sub-milisegundo. Un índice HNSW
   * sería peor, porque post-filtra: buscaría los vecinos de todo el corpus y recién después
   * descartaría los de otras licitaciones, pudiendo devolver cero resultados.
   */
  async buscarSimilares(licitacionId: string, embedding: number[], topK: number): Promise<ChunkSimilar[]> {
    const vector = aVectorLiteral(embedding);

    return prisma.$queryRaw<ChunkSimilar[]>`
      SELECT c."id",
             c."documentoId",
             d."nombreArchivo",
             c."chunkIndex",
             c."contenido",
             1 - (c."embedding" <=> ${vector}::vector) AS "similitud"
      FROM "LicitacionDocumentoChunk" c
      JOIN "LicitacionDocumento" d ON d."id" = c."documentoId"
      WHERE c."licitacionId" = ${licitacionId}
      ORDER BY c."embedding" <=> ${vector}::vector
      LIMIT ${topK}
    `;
  },

  /** Por la API de modelo y no en el $queryRaw: un COUNT(*) crudo vuelve como BigInt y rompe JSON.stringify. */
  async contarPorLicitacion(licitacionId: string): Promise<number> {
    return prisma.licitacionDocumentoChunk.count({ where: { licitacionId } });
  },

  /**
   * Documentos con texto extraído que todavía no tienen chunks.
   *
   * "Pendiente" no se deriva de `estadoExtraccion` (el upload siempre escribe COMPLETADO/FALLIDO),
   * sino de tener texto y no tener chunks — que es también lo que hace idempotente al batch.
   *
   * El filtro de texto vacío no es cosmético: un PDF escaneado se guarda COMPLETADO con
   * textoExtraido "", y sin descartarlo generaría 0 chunks, seguiría cumpliendo `chunks: none` y
   * reaparecería como pendiente en cada corrida, para siempre.
   */
  async listarDocumentosPendientes(): Promise<DocumentoPendienteEmbedding[]> {
    const documentos = await prisma.licitacionDocumento.findMany({
      where: {
        estadoExtraccion: "COMPLETADO",
        textoExtraido: { not: null },
        NOT: { textoExtraido: "" },
        chunks: { none: {} },
      },
      select: SELECT_PARA_EMBEDDING,
      orderBy: { fechaCarga: "asc" },
    });

    return documentos.map(aDocumentoPendiente);
  },

  /**
   * Documentos puntuales por id, sin el predicado de "pendiente": re-indexa aunque ya tengan chunks
   * (reemplazarChunksDeDocumento los pisa). Los eligió el usuario.
   *
   * Los que no tengan texto igual salen, y el servicio los reporta como omitidos: hacerlos
   * desaparecer en silencio dejaría al usuario esperando un documento que nunca se iba a indexar.
   */
  async listarDocumentosPorIds(ids: string[]): Promise<DocumentoPendienteEmbedding[]> {
    const documentos = await prisma.licitacionDocumento.findMany({
      where: { id: { in: ids } },
      select: SELECT_PARA_EMBEDDING,
      orderBy: { fechaCarga: "asc" },
    });

    return documentos.map(aDocumentoPendiente);
  },
};

const SELECT_PARA_EMBEDDING = {
  id: true,
  licitacionId: true,
  nombreArchivo: true,
  textoExtraido: true,
  licitacion: { select: { codigoExterno: true } },
} as const;

const aDocumentoPendiente = (documento: {
  id: string;
  licitacionId: string;
  nombreArchivo: string;
  textoExtraido: string | null;
  licitacion: { codigoExterno: string };
}): DocumentoPendienteEmbedding => ({
  id: documento.id,
  licitacionId: documento.licitacionId,
  codigoExterno: documento.licitacion.codigoExterno,
  nombreArchivo: documento.nombreArchivo,
  textoExtraido: documento.textoExtraido ?? "",
});
