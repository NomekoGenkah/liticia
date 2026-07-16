import { describe, it, expect, vi, beforeEach } from "vitest";

const chatMock = vi.fn();
const embedMock = vi.fn();

vi.mock("ollama", () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    chat: chatMock,
    embed: embedMock,
  })),
}));

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  EMBEDDING_DIMENSIONS,
  OllamaClient,
  parseAnalisisResponse,
  parseMatchingResponse,
  parseRespuestaTexto,
  validarEmbeddings,
} from "./ollamaClient";

const vectorValido = () => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);

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

describe("parseRespuestaTexto", () => {
  it("devuelve la prosa tal cual", () => {
    expect(parseRespuestaTexto("El plazo de entrega es de 30 días corridos.")).toBe(
      "El plazo de entrega es de 30 días corridos."
    );
  });

  it("quita el bloque <think> antes de la respuesta", () => {
    const content = "<think>El usuario pregunta por el plazo...</think>\nSon 30 días.";

    expect(parseRespuestaTexto(content)).toBe("Son 30 días.");
  });

  it("conserva intactas las comillas y los saltos de línea de la prosa", () => {
    // El motivo por el que generarRespuesta no usa un JSON schema: forzar al modelo a escapar
    // esto es un modo de falla clásico, y acá no hay nada que escapar.
    const content = 'Las bases dicen: "plazo de 30 días".\n\nAdemás exigen boleta de garantía.';

    expect(parseRespuestaTexto(content)).toBe(content);
  });

  it("no toca los fences de Markdown que vengan en la prosa", () => {
    const content = "El formato pedido es:\n```\nRUT;Nombre\n```";

    expect(parseRespuestaTexto(content)).toBe(content);
  });

  it("lanza si el modelo devuelve una respuesta vacía", () => {
    expect(() => parseRespuestaTexto("   ")).toThrow(/respuesta vacía/);
  });

  it("lanza si tras quitar el <think> no queda nada", () => {
    expect(() => parseRespuestaTexto("<think>me quedé pensando</think>")).toThrow(/respuesta vacía/);
  });
});

describe("validarEmbeddings", () => {
  it("acepta vectores de la dimensión esperada", () => {
    const embeddings = [vectorValido(), vectorValido()];

    expect(validarEmbeddings(embeddings, 2)).toEqual(embeddings);
  });

  it("lanza si el modelo devuelve otra cantidad de vectores que la pedida", () => {
    expect(() => validarEmbeddings([vectorValido()], 2)).toThrow(/devolvió 1 vectores, se esperaban 2/);
  });

  it("lanza si el modelo devuelve vectores de otra dimensión", () => {
    // El caso real: alguien apunta OLLAMA_EMBED_MODEL a un modelo de 1024 dims.
    const equivocado = Array.from({ length: 1024 }, () => 0.1);

    expect(() => validarEmbeddings([equivocado], 1)).toThrow(/1024 dimensiones, se esperaban 768/);
  });

  it("lanza si un vector trae componentes no finitos", () => {
    const conNaN = vectorValido();
    conNaN[5] = Number.NaN;

    expect(() => validarEmbeddings([conNaN], 1)).toThrow(/componentes no numéricos/);
  });

  it("lanza si la respuesta no es un array", () => {
    expect(() => validarEmbeddings(undefined, 1)).toThrow(/se esperaban 1/);
  });
});

describe("OllamaClient.generarEmbedding", () => {
  beforeEach(() => {
    embedMock.mockReset();
  });

  it("embebe el lote completo en una sola llamada y pide no truncar", async () => {
    embedMock.mockResolvedValue({ embeddings: [vectorValido(), vectorValido()] });

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      embedModel: "nomic-embed-text",
      timeoutMs: 60000,
      retryMax: 2,
      retryBaseDelayMs: 1,
      think: false,
    });

    const vectores = await client.generarEmbedding(["uno", "dos"]);

    expect(vectores).toHaveLength(2);
    expect(embedMock).toHaveBeenCalledTimes(1);
    expect(embedMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "nomic-embed-text", input: ["uno", "dos"], truncate: false })
    );
  });

  it("no llama a Ollama con un lote vacío", async () => {
    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      embedModel: "nomic-embed-text",
      timeoutMs: 60000,
      retryMax: 0,
      retryBaseDelayMs: 1,
      think: false,
    });

    expect(await client.generarEmbedding([])).toEqual([]);
    expect(embedMock).not.toHaveBeenCalled();
  });

  it("reintenta vía withRetry si embed() rechaza, y lanza tras agotar los intentos", async () => {
    embedMock.mockRejectedValue(new Error("conexión rechazada"));

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      embedModel: "nomic-embed-text",
      timeoutMs: 60000,
      retryMax: 2,
      retryBaseDelayMs: 1,
      think: false,
    });

    await expect(client.generarEmbedding(["uno"])).rejects.toThrow(/Falló la llamada de embeddings a Ollama/);
    expect(embedMock).toHaveBeenCalledTimes(3);
  });
});

describe("OllamaClient.generarRespuesta", () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it("pide la respuesta sin format y con la ventana de contexto configurada", async () => {
    chatMock.mockResolvedValue({ message: { content: "Son 30 días corridos." } });

    const client = new OllamaClient({
      host: "http://localhost:11434",
      model: "qwen3:8b",
      ragNumCtx: 8192,
      timeoutMs: 180000,
      retryMax: 2,
      retryBaseDelayMs: 1,
      think: false,
    });

    expect(await client.generarRespuesta({ system: "sys", user: "user" })).toBe("Son 30 días corridos.");

    expect(chatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "qwen3:8b",
        options: expect.objectContaining({ num_ctx: 8192 }),
      })
    );
    // Sin JSON schema: la respuesta es prosa (ver generarRespuesta).
    expect(chatMock).not.toHaveBeenCalledWith(expect.objectContaining({ format: expect.anything() }));
  });
});
