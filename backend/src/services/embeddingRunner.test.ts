import { beforeEach, describe, expect, it, vi } from "vitest";

const embeberPendientes = vi.fn();

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../config/env", () => ({
  config: {
    OLLAMA_URL: "http://localhost:11434",
    OLLAMA_MODEL: "qwen3:8b",
    OLLAMA_EMBED_MODEL: "nomic-embed-text",
    OLLAMA_REQUEST_TIMEOUT_MS: 60000,
    OLLAMA_RETRY_MAX: 2,
    OLLAMA_RETRY_BASE_DELAY_MS: 1,
    OLLAMA_THINK: false,
  },
}));
vi.mock("ollama", () => ({ Ollama: vi.fn().mockImplementation(() => ({ chat: vi.fn(), embed: vi.fn() })) }));
vi.mock("../repositories/documentoChunkRepository", () => ({ documentoChunkRepository: {} }));
vi.mock("./embeddingDocumentosService", () => ({
  EmbeddingDocumentosService: vi.fn().mockImplementation(() => ({ embeberPendientes })),
}));

import { ejecutarEmbeddingPendientes, estaEmbeddingEnProceso, iniciarEmbeddingPendientes } from "./embeddingRunner";

const resumen = { totalEncontrados: 1, totalCompletados: 1, totalFallidos: 0, totalOmitidos: 0 };

describe("embeddingRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embeberPendientes.mockResolvedValue(resumen);
  });

  it("no reporta proceso en curso cuando está inactivo", () => {
    expect(estaEmbeddingEnProceso()).toBe(false);
  });

  it("ejecuta el batch y devuelve el resumen al CLI", async () => {
    expect(await ejecutarEmbeddingPendientes()).toEqual(resumen);
    expect(estaEmbeddingEnProceso()).toBe(false);
  });

  it("libera el lock aunque el batch falle", async () => {
    embeberPendientes.mockRejectedValue(new Error("Ollama caído"));

    await expect(ejecutarEmbeddingPendientes()).rejects.toThrow(/Ollama caído/);
    expect(estaEmbeddingEnProceso()).toBe(false);
  });

  it("rechaza un segundo disparo mientras hay uno en curso", async () => {
    let liberar!: (valor: typeof resumen) => void;
    embeberPendientes.mockReturnValue(new Promise((resolve) => (liberar = resolve)));

    iniciarEmbeddingPendientes();
    expect(estaEmbeddingEnProceso()).toBe(true);

    expect(() => iniciarEmbeddingPendientes()).toThrow(/Ya hay una generación de embeddings en curso/);
    expect(embeberPendientes).toHaveBeenCalledTimes(1);

    liberar(resumen);
    await vi.waitFor(() => expect(estaEmbeddingEnProceso()).toBe(false));
  });

  it("libera el lock cuando el batch en background falla", async () => {
    embeberPendientes.mockRejectedValue(new Error("Ollama caído"));

    iniciarEmbeddingPendientes();

    await vi.waitFor(() => expect(estaEmbeddingEnProceso()).toBe(false));
  });
});
