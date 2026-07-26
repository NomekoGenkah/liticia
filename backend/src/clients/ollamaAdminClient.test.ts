import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaApiError } from "../utils/errors";
import { OllamaAdminClient } from "./ollamaAdminClient";

const HOST = "http://ollama.test:11434";

/** Un ReadableStream falso: entrega los chunks dados y luego termina. */
function bodyDesde(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    getReader() {
      return {
        read: async () => (i < chunks.length ? { done: false, value: encoder.encode(chunks[i++]) } : { done: true, value: undefined }),
        releaseLock() {},
      };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OllamaAdminClient.listar", () => {
  it("mapea la respuesta de /api/tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          models: [
            { name: "qwen3:4b", size: 2500, details: { family: "qwen3", parameter_size: "4B", quantization_level: "Q4_K_M" } },
          ],
        }),
      }))
    );

    const modelos = await new OllamaAdminClient(HOST).listar();
    expect(modelos).toEqual([
      { nombre: "qwen3:4b", tamañoBytes: 2500, familia: "qwen3", parametros: "4B", cuantizacion: "Q4_K_M" },
    ]);
  });

  it("lanza OllamaApiError si Ollama responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(new OllamaAdminClient(HOST).listar()).rejects.toBeInstanceOf(OllamaApiError);
  });
});

describe("OllamaAdminClient.pull", () => {
  it("emite cada línea NDJSON como un evento de progreso", async () => {
    const chunks = [
      '{"status":"pulling manifest"}\n{"status":"downloading","total":100,',
      '"completed":50}\n',
      '{"status":"success"}\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, body: bodyDesde(chunks) })));

    const eventos = [];
    for await (const ev of new OllamaAdminClient(HOST).pull("qwen3:4b")) {
      eventos.push(ev);
    }

    expect(eventos).toEqual([
      { status: "pulling manifest" },
      { status: "downloading", total: 100, completed: 50 },
      { status: "success" },
    ]);
  });

  it("lanza si un evento trae 'error'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, body: bodyDesde(['{"error":"model not found"}\n']) })));

    const iterar = async () => {
      for await (const _ of new OllamaAdminClient(HOST).pull("no-existe")) {
        // consumir
      }
    };
    await expect(iterar()).rejects.toBeInstanceOf(OllamaApiError);
  });
});
