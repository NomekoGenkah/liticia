import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("../config/env", () => ({
  config: { OLLAMA_EMBED_MODEL: "nomic-embed-text", OLLAMA_EMBED_BATCH_SIZE: 16 },
}));

import type { OllamaClient } from "../clients/ollamaClient";
import type { ChunkInsertInput, documentoChunkRepository } from "../repositories/documentoChunkRepository";
import { EmbeddingDocumentosService } from "./embeddingDocumentosService";

const vector = () => Array.from({ length: 768 }, () => 0.1);

function documento(overrides: Partial<{ id: string; textoExtraido: string }> = {}) {
  return {
    id: "doc-1",
    licitacionId: "lic-1",
    codigoExterno: "1234-5-LE24",
    nombreArchivo: "bases.pdf",
    textoExtraido: "Contenido breve de las bases.",
    ...overrides,
  };
}

function crearMocks(pendientes: ReturnType<typeof documento>[]) {
  const generarEmbedding = vi.fn(async (textos: string[]) => textos.map(() => vector()));
  const reemplazarChunksDeDocumento = vi.fn(async (_documentoId: string, _chunks: ChunkInsertInput[]) => []);

  const ollamaClient = { generarEmbedding } as unknown as OllamaClient;
  const chunkRepo = {
    listarDocumentosPendientes: vi.fn(async () => pendientes),
    reemplazarChunksDeDocumento,
  } as unknown as typeof documentoChunkRepository;

  return { ollamaClient, chunkRepo, generarEmbedding, reemplazarChunksDeDocumento };
}

describe("EmbeddingDocumentosService.embeberPendientes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persiste chunks con índice correlativo y la licitación del documento", async () => {
    const texto = Array.from({ length: 20 }, (_, i) => `Cláusula ${i} con bastante relleno.`).join("\n\n");
    const { ollamaClient, chunkRepo, reemplazarChunksDeDocumento } = crearMocks([
      documento({ textoExtraido: texto }),
    ]);

    const resumen = await new EmbeddingDocumentosService(ollamaClient, chunkRepo).embeberPendientes();

    expect(resumen).toEqual({ totalEncontrados: 1, totalCompletados: 1, totalFallidos: 0, totalOmitidos: 0 });

    const [documentoId, chunks] = reemplazarChunksDeDocumento.mock.calls[0]!;
    expect(documentoId).toBe("doc-1");
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, i) => i));
    expect(chunks.every((chunk) => chunk.licitacionId === "lic-1")).toBe(true);
    expect(chunks.every((chunk) => chunk.modelo === "nomic-embed-text")).toBe(true);
  });

  it("embebe con el prefijo search_document pero persiste el contenido limpio", async () => {
    const { ollamaClient, chunkRepo, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks([
      documento({ textoExtraido: "Plazo de entrega: 30 días." }),
    ]);

    await new EmbeddingDocumentosService(ollamaClient, chunkRepo).embeberPendientes();

    expect(generarEmbedding).toHaveBeenCalledWith(["search_document: Plazo de entrega: 30 días."]);

    const [, chunks] = reemplazarChunksDeDocumento.mock.calls[0]!;
    expect(chunks[0]!.contenido).toBe("Plazo de entrega: 30 días.");
  });

  it("parte el trabajo en sub-lotes del tamaño configurado", async () => {
    // 40 párrafos largos => varios chunks => más de un lote de 16.
    const texto = Array.from({ length: 120 }, (_, i) => `Párrafo ${i}. ${"relleno ".repeat(60)}`).join("\n\n");
    const { ollamaClient, chunkRepo, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks([
      documento({ textoExtraido: texto }),
    ]);

    await new EmbeddingDocumentosService(ollamaClient, chunkRepo).embeberPendientes();

    const [, chunks] = reemplazarChunksDeDocumento.mock.calls[0]!;
    expect(generarEmbedding).toHaveBeenCalledTimes(Math.ceil(chunks.length / 16));
    for (const [textos] of generarEmbedding.mock.calls) {
      expect(textos.length).toBeLessThanOrEqual(16);
    }
  });

  it("omite documentos sin texto aprovechable sin llamar al modelo", async () => {
    // El PDF escaneado: COMPLETADO pero con texto vacío.
    const { ollamaClient, chunkRepo, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks([
      documento({ textoExtraido: "   \n  " }),
    ]);

    const resumen = await new EmbeddingDocumentosService(ollamaClient, chunkRepo).embeberPendientes();

    expect(resumen).toEqual({ totalEncontrados: 1, totalCompletados: 0, totalFallidos: 0, totalOmitidos: 1 });
    expect(generarEmbedding).not.toHaveBeenCalled();
    expect(reemplazarChunksDeDocumento).not.toHaveBeenCalled();
  });

  it("sigue con el resto del batch cuando un documento falla", async () => {
    const { ollamaClient, chunkRepo, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks([
      documento({ id: "doc-1" }),
      documento({ id: "doc-2" }),
      documento({ id: "doc-3" }),
    ]);

    generarEmbedding.mockRejectedValueOnce(new Error("Ollama caído"));

    const resumen = await new EmbeddingDocumentosService(ollamaClient, chunkRepo).embeberPendientes();

    expect(resumen).toEqual({ totalEncontrados: 3, totalCompletados: 2, totalFallidos: 1, totalOmitidos: 0 });
    expect(reemplazarChunksDeDocumento).toHaveBeenCalledTimes(2);
  });

  it("no hace nada si no hay documentos pendientes", async () => {
    const { ollamaClient, chunkRepo, generarEmbedding } = crearMocks([]);

    const resumen = await new EmbeddingDocumentosService(ollamaClient, chunkRepo).embeberPendientes();

    expect(resumen.totalEncontrados).toBe(0);
    expect(generarEmbedding).not.toHaveBeenCalled();
  });
});
