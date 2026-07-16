import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock("../config/env", () => ({
  config: { OLLAMA_MODEL: "qwen3:8b", RAG_TOP_K: 5 },
}));

import type { OllamaClient } from "../clients/ollamaClient";
import type { ChunkSimilar, documentoChunkRepository } from "../repositories/documentoChunkRepository";
import type { licitacionRepository } from "../repositories/licitacionRepository";
import type { preguntaLicitacionRepository } from "../repositories/preguntaLicitacionRepository";
import { PreguntasLicitacionService } from "./preguntasLicitacionService";

const vector = () => Array.from({ length: 768 }, () => 0.1);

const chunkRecuperado: ChunkSimilar = {
  id: "chunk-1",
  documentoId: "doc-1",
  nombreArchivo: "bases.pdf",
  chunkIndex: 3,
  contenido: "El plazo de entrega es de 30 días corridos desde la orden de compra.",
  similitud: 0.82,
};

function crearMocks(
  opciones: { licitacion?: { id: string } | null; totalChunks?: number; chunks?: ChunkSimilar[] } = {}
) {
  const { licitacion = { id: "lic-1" }, totalChunks = 12, chunks = [chunkRecuperado] } = opciones;

  const generarEmbedding = vi.fn(async () => [vector()]);
  const generarRespuesta = vi.fn(async () => "El plazo es de 30 días corridos.");
  const crear = vi.fn(async (input: unknown) => ({ id: "preg-1", duracionMs: 10, ...(input as object) }));

  const ollamaClient = { generarEmbedding, generarRespuesta } as unknown as OllamaClient;
  const licitacionRepo = { findByCodigoExterno: vi.fn(async () => licitacion) } as unknown as typeof licitacionRepository;
  const chunkRepo = {
    contarPorLicitacion: vi.fn(async () => totalChunks),
    buscarSimilares: vi.fn(async () => chunks),
  } as unknown as typeof documentoChunkRepository;
  const preguntaRepo = {
    crear,
    listarPorLicitacion: vi.fn(async () => []),
  } as unknown as typeof preguntaLicitacionRepository;

  const servicio = new PreguntasLicitacionService(ollamaClient, licitacionRepo, chunkRepo, preguntaRepo);

  return { servicio, generarEmbedding, generarRespuesta, crear, chunkRepo };
}

describe("PreguntasLicitacionService.responder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lanza NotFoundError si la licitación no existe", async () => {
    const { servicio } = crearMocks({ licitacion: null });

    await expect(servicio.responder("NO-EXISTE", "¿Cuál es el plazo?")).rejects.toThrow(/No existe la licitación/);
  });

  it("lanza CHUNKS_REQUERIDOS si la licitación no tiene documentos indexados", async () => {
    const { servicio, generarRespuesta } = crearMocks({ totalChunks: 0 });

    await expect(servicio.responder("1234-5-LE24", "¿Cuál es el plazo?")).rejects.toMatchObject({
      code: "CHUNKS_REQUERIDOS",
      statusCode: 422,
    });
    expect(generarRespuesta).not.toHaveBeenCalled();
  });

  it("embebe la pregunta con el prefijo search_query", async () => {
    const { servicio, generarEmbedding } = crearMocks();

    await servicio.responder("1234-5-LE24", "¿Cuál es el plazo?");

    expect(generarEmbedding).toHaveBeenCalledWith(["search_query: ¿Cuál es el plazo?"]);
  });

  it("deriva las fuentes de los chunks recuperados, no de lo que diga el modelo", async () => {
    // El modelo cita un documento que no existe; las fuentes guardadas deben ignorarlo.
    const { servicio, generarRespuesta, crear } = crearMocks();
    generarRespuesta.mockResolvedValue("Según anexo-inventado.pdf, el plazo es de 90 días.");

    await servicio.responder("1234-5-LE24", "¿Cuál es el plazo?");

    const guardado = crear.mock.calls[0]![0] as { fuentes: unknown[] };
    expect(guardado.fuentes).toEqual([
      {
        documentoId: "doc-1",
        nombreArchivo: "bases.pdf",
        chunkIndex: 3,
        similitud: 0.82,
        extracto: chunkRecuperado.contenido,
      },
    ]);
  });

  it("recorta el extracto de las fuentes en vez de duplicar el chunk entero", async () => {
    const largo = { ...chunkRecuperado, contenido: "x".repeat(1000) };
    const { servicio, crear } = crearMocks({ chunks: [largo] });

    await servicio.responder("1234-5-LE24", "¿Cuál es el plazo?");

    const guardado = crear.mock.calls[0]![0] as { fuentes: { extracto: string }[] };
    expect(guardado.fuentes[0]!.extracto).toHaveLength(200);
  });

  it("acota la búsqueda a la licitación preguntada y al top-k configurado", async () => {
    const { servicio, chunkRepo } = crearMocks();

    await servicio.responder("1234-5-LE24", "¿Cuál es el plazo?");

    expect(chunkRepo.buscarSimilares).toHaveBeenCalledWith("lic-1", expect.any(Array), 5);
  });

  it("no guarda nada si el modelo falla", async () => {
    const { servicio, generarRespuesta, crear } = crearMocks();
    generarRespuesta.mockRejectedValue(new Error("Ollama caído"));

    await expect(servicio.responder("1234-5-LE24", "¿Cuál es el plazo?")).rejects.toThrow(/Ollama caído/);
    expect(crear).not.toHaveBeenCalled();
  });

  it("guarda la respuesta con el modelo y la versión de prompt usados", async () => {
    const { servicio, crear } = crearMocks();

    await servicio.responder("1234-5-LE24", "¿Cuál es el plazo?");

    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        licitacionId: "lic-1",
        pregunta: "¿Cuál es el plazo?",
        respuesta: "El plazo es de 30 días corridos.",
        modelo: "qwen3:8b",
        promptVersion: 1,
      })
    );
  });
});
