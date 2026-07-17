import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("../config/env", () => ({
  config: { OLLAMA_EMBED_MODEL: "nomic-embed-text", OLLAMA_EMBED_BATCH_SIZE: 16 },
}));

import type { OllamaClient } from "../clients/ollamaClient";
import type { ChunkInsertInput, documentoChunkRepository } from "../repositories/documentoChunkRepository";
import { ProcesoCanceladoError } from "../utils/errors";
import { EmbeddingDocumentosService } from "./embeddingDocumentosService";

const vector = () => Array.from({ length: 768 }, () => 0.1);

const opcionesItem = (signal: AbortSignal = new AbortController().signal) => ({
  signal,
  onToken: vi.fn(),
  onReintento: vi.fn(),
});

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

function crearMocks(pendientes: ReturnType<typeof documento>[] = []) {
  const generarEmbedding = vi.fn(async (textos: string[]) => textos.map(() => vector()));
  const reemplazarChunksDeDocumento = vi.fn(async (_documentoId: string, _chunks: ChunkInsertInput[]) => []);

  const ollamaClient = { generarEmbedding } as unknown as OllamaClient;
  const chunkRepo = {
    listarDocumentosPendientes: vi.fn(async () => pendientes),
    listarDocumentosPorIds: vi.fn(async () => pendientes),
    reemplazarChunksDeDocumento,
  } as unknown as typeof documentoChunkRepository;

  const service = new EmbeddingDocumentosService(ollamaClient, chunkRepo);

  return { service, ollamaClient, chunkRepo, generarEmbedding, reemplazarChunksDeDocumento };
}

describe("EmbeddingDocumentosService.procesar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persiste chunks con índice correlativo y la licitación del documento", async () => {
    const texto = Array.from({ length: 20 }, (_, i) => `Cláusula ${i} con bastante relleno.`).join("\n\n");
    const { service, reemplazarChunksDeDocumento } = crearMocks();

    const resultado = await service.procesar(documento({ textoExtraido: texto }), undefined, opcionesItem());

    expect(resultado).toBe("COMPLETADO");

    const [documentoId, chunks] = reemplazarChunksDeDocumento.mock.calls[0]!;
    expect(documentoId).toBe("doc-1");
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, i) => i));
    expect(chunks.every((chunk) => chunk.licitacionId === "lic-1")).toBe(true);
    expect(chunks.every((chunk) => chunk.modelo === "nomic-embed-text")).toBe(true);
  });

  it("embebe con el prefijo search_document pero persiste el contenido limpio", async () => {
    const { service, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks();

    await service.procesar(documento({ textoExtraido: "Plazo de entrega: 30 días." }), undefined, opcionesItem());

    expect(generarEmbedding).toHaveBeenCalledWith(["search_document: Plazo de entrega: 30 días."]);

    const [, chunks] = reemplazarChunksDeDocumento.mock.calls[0]!;
    expect(chunks[0]!.contenido).toBe("Plazo de entrega: 30 días.");
  });

  it("parte el trabajo en sub-lotes del tamaño configurado", async () => {
    const texto = Array.from({ length: 120 }, (_, i) => `Párrafo ${i}. ${"relleno ".repeat(60)}`).join("\n\n");
    const { service, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks();

    await service.procesar(documento({ textoExtraido: texto }), undefined, opcionesItem());

    const [, chunks] = reemplazarChunksDeDocumento.mock.calls[0]!;
    expect(generarEmbedding).toHaveBeenCalledTimes(Math.ceil(chunks.length / 16));
    for (const [textos] of generarEmbedding.mock.calls) {
      expect(textos.length).toBeLessThanOrEqual(16);
    }
  });

  it("omite documentos sin texto aprovechable sin llamar al modelo", async () => {
    // El PDF escaneado: COMPLETADO pero con texto vacío.
    const { service, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks();

    const resultado = await service.procesar(documento({ textoExtraido: "   \n  " }), undefined, opcionesItem());

    expect(resultado).toBe("OMITIDO");
    expect(generarEmbedding).not.toHaveBeenCalled();
    expect(reemplazarChunksDeDocumento).not.toHaveBeenCalled();
  });

  it("corta entre sub-lotes si el usuario canceló, sin persistir nada", async () => {
    // generarEmbedding no acepta signal (la lib no lo soporta para /api/embed): el corte entre
    // lotes es el único punto de cancelación que tiene un documento.
    const texto = Array.from({ length: 120 }, (_, i) => `Párrafo ${i}. ${"relleno ".repeat(60)}`).join("\n\n");
    const controller = new AbortController();
    const { service, generarEmbedding, reemplazarChunksDeDocumento } = crearMocks();

    generarEmbedding.mockImplementationOnce(async (textos: string[]) => {
      controller.abort();
      return textos.map(() => vector());
    });

    await expect(
      service.procesar(documento({ textoExtraido: texto }), undefined, opcionesItem(controller.signal))
    ).rejects.toBeInstanceOf(ProcesoCanceladoError);

    expect(generarEmbedding).toHaveBeenCalledTimes(1);
    expect(reemplazarChunksDeDocumento).not.toHaveBeenCalled();
  });
});

describe("EmbeddingDocumentosService.planificar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("modo PENDIENTES pide los documentos con texto y sin chunks", async () => {
    const { service, chunkRepo } = crearMocks([documento()]);

    const plan = await service.planificar({ modo: "PENDIENTES" });

    expect(chunkRepo.listarDocumentosPendientes).toHaveBeenCalled();
    expect(plan.items).toHaveLength(1);
    expect(plan.parametros).toEqual({ modo: "PENDIENTES" });
  });

  it("modo IDS pide los documentos puntuales, sin el predicado de pendiente", async () => {
    const { service, chunkRepo } = crearMocks([documento()]);

    const plan = await service.planificar({ modo: "IDS", ids: ["doc-1"] });

    expect(chunkRepo.listarDocumentosPorIds).toHaveBeenCalledWith(["doc-1"]);
    expect(chunkRepo.listarDocumentosPendientes).not.toHaveBeenCalled();
    expect(plan.parametros).toEqual({ modo: "IDS", ids: ["doc-1"] });
  });

  it("no encuentra nada si no hay documentos pendientes", async () => {
    const { service, generarEmbedding } = crearMocks([]);

    const plan = await service.planificar({ modo: "PENDIENTES" });

    expect(plan.items).toHaveLength(0);
    expect(generarEmbedding).not.toHaveBeenCalled();
  });
});
