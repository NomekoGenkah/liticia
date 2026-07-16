import { describe, it, expect, vi, beforeEach } from "vitest";

const chatMock = vi.fn();

vi.mock("ollama", () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    chat: chatMock,
  })),
}));

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { OllamaClient, parseAnalisisResponse, parseMatchingResponse } from "./ollamaClient";

const respuestaValida = {
  resumenEjecutivo: "Contratación de servicio de mantención.",
  puntosClave: ["Requiere certificación técnica"],
  palabrasClave: ["mantención", "climatización"],
  nivelComplejidad: "media",
};

const matchingValido = {
  puntaje: 85,
  recomendacion: "si",
  justificacion: "El rubro y la región calzan con el perfil declarado.",
};

describe("parseAnalisisResponse", () => {
  it("parsea una respuesta JSON bien formada", () => {
    const resultado = parseAnalisisResponse(JSON.stringify(respuestaValida));
    expect(resultado).toEqual(respuestaValida);
  });

  it("quita un bloque <think>...</think> inicial antes de parsear", () => {
    const content = `<think>\nEl usuario pide analizar esto...\n</think>\n${JSON.stringify(respuestaValida)}`;
    expect(parseAnalisisResponse(content)).toEqual(respuestaValida);
  });

  it("quita fences de Markdown (```json ... ```) antes de parsear", () => {
    const content = "```json\n" + JSON.stringify(respuestaValida) + "\n```";
    expect(parseAnalisisResponse(content)).toEqual(respuestaValida);
  });

  it("quita tanto el bloque <think> como los fences de Markdown combinados", () => {
    const content = `<think>razonando...</think>\n\`\`\`json\n${JSON.stringify(respuestaValida)}\n\`\`\``;
    expect(parseAnalisisResponse(content)).toEqual(respuestaValida);
  });

  it("lanza OllamaApiError si el contenido no es JSON válido", () => {
    expect(() => parseAnalisisResponse("esto no es json")).toThrow(/JSON válido/);
  });

  it("lanza OllamaApiError si falta un campo requerido", () => {
    const { resumenEjecutivo, ...incompleto } = respuestaValida;
    expect(() => parseAnalisisResponse(JSON.stringify(incompleto))).toThrow(/schema esperado/);
  });

  it("lanza OllamaApiError si nivelComplejidad no es uno de los valores permitidos", () => {
    const invalido = { ...respuestaValida, nivelComplejidad: "extrema" };
    expect(() => parseAnalisisResponse(JSON.stringify(invalido))).toThrow(/schema esperado/);
  });
});

describe("parseMatchingResponse", () => {
  it("parsea una respuesta JSON bien formada", () => {
    const resultado = parseMatchingResponse(JSON.stringify(matchingValido));
    expect(resultado).toEqual(matchingValido);
  });

  it("quita un bloque <think>...</think> inicial antes de parsear", () => {
    const content = `<think>\nevaluando el perfil...\n</think>\n${JSON.stringify(matchingValido)}`;
    expect(parseMatchingResponse(content)).toEqual(matchingValido);
  });

  it("quita fences de Markdown (```json ... ```) antes de parsear", () => {
    const content = "```json\n" + JSON.stringify(matchingValido) + "\n```";
    expect(parseMatchingResponse(content)).toEqual(matchingValido);
  });

  it("lanza OllamaApiError si el contenido no es JSON válido", () => {
    expect(() => parseMatchingResponse("esto no es json")).toThrow(/JSON válido/);
  });

  it("lanza OllamaApiError si falta un campo requerido", () => {
    const { justificacion, ...incompleto } = matchingValido;
    expect(() => parseMatchingResponse(JSON.stringify(incompleto))).toThrow(/schema esperado/);
  });

  it("lanza OllamaApiError si recomendacion no es uno de los valores permitidos", () => {
    const invalido = { ...matchingValido, recomendacion: "obvio" };
    expect(() => parseMatchingResponse(JSON.stringify(invalido))).toThrow(/schema esperado/);
  });

  it("lanza OllamaApiError si puntaje está fuera del rango 0-100", () => {
    const invalido = { ...matchingValido, puntaje: 150 };
    expect(() => parseMatchingResponse(JSON.stringify(invalido))).toThrow(/schema esperado/);
  });
});

describe("OllamaClient.generarAnalisis", () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it("llama a chat() con model/format/think correctos y parsea la respuesta", async () => {
    chatMock.mockResolvedValueOnce({ message: { role: "assistant", content: JSON.stringify(respuestaValida) } });

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      timeoutMs: 60000,
      retryMax: 2,
      retryBaseDelayMs: 10,
      think: false,
    });

    const resultado = await client.generarAnalisis({ system: "sys", user: "user" });

    expect(resultado).toEqual(respuestaValida);
    expect(chatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "qwen3:8b",
        think: false,
        stream: false,
        format: expect.objectContaining({ type: "object" }),
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "user" },
        ],
      })
    );
  });

  it("reintenta vía withRetry si chat() rechaza, y lanza tras agotar los intentos", async () => {
    chatMock.mockRejectedValue(new Error("conexión rechazada"));

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      timeoutMs: 60000,
      retryMax: 2,
      retryBaseDelayMs: 1,
      think: false,
    });

    await expect(client.generarAnalisis({ system: "sys", user: "user" })).rejects.toThrow(/Falló la llamada a Ollama/);
    expect(chatMock).toHaveBeenCalledTimes(3);
  });

  it("se recupera si un intento falla pero el siguiente funciona", async () => {
    chatMock
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ message: { role: "assistant", content: JSON.stringify(respuestaValida) } });

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      timeoutMs: 60000,
      retryMax: 2,
      retryBaseDelayMs: 1,
      think: false,
    });

    const resultado = await client.generarAnalisis({ system: "sys", user: "user" });
    expect(resultado).toEqual(respuestaValida);
    expect(chatMock).toHaveBeenCalledTimes(2);
  });
});

describe("OllamaClient.generarMatching", () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it("llama a chat() con model/format/think correctos y parsea la respuesta", async () => {
    chatMock.mockResolvedValueOnce({ message: { role: "assistant", content: JSON.stringify(matchingValido) } });

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      timeoutMs: 60000,
      retryMax: 2,
      retryBaseDelayMs: 10,
      think: false,
    });

    const resultado = await client.generarMatching({ system: "sys", user: "user" });

    expect(resultado).toEqual(matchingValido);
    expect(chatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "qwen3:8b",
        think: false,
        stream: false,
        format: expect.objectContaining({ type: "object" }),
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "user" },
        ],
      })
    );
  });

  it("reintenta vía withRetry si chat() rechaza, y lanza tras agotar los intentos", async () => {
    chatMock.mockRejectedValue(new Error("conexión rechazada"));

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      timeoutMs: 60000,
      retryMax: 2,
      retryBaseDelayMs: 1,
      think: false,
    });

    await expect(client.generarMatching({ system: "sys", user: "user" })).rejects.toThrow(/Falló la llamada a Ollama/);
    expect(chatMock).toHaveBeenCalledTimes(3);
  });
});
