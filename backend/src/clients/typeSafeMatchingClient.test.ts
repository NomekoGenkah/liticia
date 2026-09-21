import { describe, it, expect, vi } from "vitest";
import { APIUserAbortError, type TypeSafeClient } from "@typesafe-ai/sdk";
import { TypeSafeMatchingClient } from "./typeSafeMatchingClient";
import type { LicitacionParaMatching, PerfilEmpresaParaMatching } from "./ollamaClient.types";
import { ProcesoCanceladoError, TypeSafeApiError } from "../utils/errors";

describe("TypeSafeMatchingClient", () => {
  const perfil: PerfilEmpresaParaMatching = {
    tipo: "EMPRESA",
    nombre: "Climatizaciones Sur",
    descripcion: "Especialistas en climatización hospitalaria e industrial",
    rubro: "Climatización",
    palabrasClave: ["HVAC", "aire acondicionado", "ventilación"],
    categoriasUnspsc: ["72101507"],
    regionesInteres: ["Metropolitana", "Valparaíso"],
    montoMinimo: 10000000,
    montoMaximo: 80000000,
  };

  const licitacion: LicitacionParaMatching = {
    nombre: "Mantención Preventiva HVAC Hospital Sótero del Río",
    nombreOrganismo: "Servicio de Salud Metropolitano Sur Oriente",
    montoEstimado: 45000000,
    moneda: "CLP",
    regionUnidad: "Metropolitana",
    tipo: "LP",
    fechaCierre: new Date("2026-09-30"),
    analisis: {
      resumenEjecutivo: "Servicio integral de mantención para sistemas de climatización y filtros HEPA.",
      puntosClave: ["Experiencia comprobable mínima 3 años", "Disponibilidad 24/7 para emergencias"],
      palabrasClave: ["climatización", "HVAC", "hospital"],
      nivelComplejidad: "MEDIA",
    },
  };

  function createMockTypeSafeClient(systemOneResponse: unknown) {
    return {
      systemOne: vi.fn().mockResolvedValue(systemOneResponse),
    } as unknown as TypeSafeClient;
  }

  it("calcula el puntaje con composite scoring y formatea recomendación y justificación", async () => {
    const mockResponse = {
      model: "jev-latest",
      answers: {
        afinidad_rubro: {
          type: "score",
          score: 3.0, // 3/3 = 100% -> peso 0.5 = 50
          confidence: 0.95,
          legend: {},
          probabilities: { "0": 0, "1": 0, "2": 0, "3": 1 },
        },
        viabilidad_monto: {
          type: "score",
          score: 3.0, // 3/3 = 100% -> peso 0.25 = 25
          confidence: 0.92,
          legend: {},
          probabilities: { "0": 0, "1": 0, "2": 0, "3": 1 },
        },
        compatibilidad_requisitos: {
          type: "score",
          score: 3.0, // 3/3 = 100% -> peso 0.25 = 25
          confidence: 0.88,
          legend: {},
          probabilities: { "0": 0, "1": 0, "2": 0, "3": 1 },
        },
        recomendacion: {
          type: "choice",
          choice: "si",
          confidence: 0.94,
          probabilities: { si: 0.94, no: 0.01, tal_vez: 0.05 },
        },
      },
      usage: { input_tokens: 150, output_tokens: 20 },
    };

    const mockClient = createMockTypeSafeClient(mockResponse);
    const client = new TypeSafeMatchingClient({
      client: mockClient,
      model: "jev-latest",
    });

    const onToken = vi.fn();
    const opts = {
      signal: new AbortController().signal,
      onToken,
      onReintento: vi.fn(),
    };

    const resultado = await client.generarMatching(perfil, licitacion, opts);

    expect(resultado.puntaje).toBe(100);
    expect(resultado.recomendacion).toBe("si");
    expect(resultado.justificacion).toContain("afinidad de rubro al 100%");
    expect(resultado.justificacion).toContain("viabilidad de monto al 100%");
    expect(resultado.justificacion).toContain("compatibilidad territorial/formal al 100%");
    expect(resultado.justificacion).toContain("Recomendación: Sí (confianza 94%)");
    expect(onToken).toHaveBeenCalledWith(resultado.justificacion, "respuesta");
  });

  it("calcula puntaje ponderado intermedio correctamente", async () => {
    const mockResponse = {
      model: "jev-latest",
      answers: {
        afinidad_rubro: {
          type: "score",
          score: 1.5, // 1.5 / 3 = 0.5 -> peso 0.5 = 25
          confidence: 0.7,
          legend: {},
          probabilities: { "0": 0.1, "1": 0.4, "2": 0.4, "3": 0.1 },
        },
        viabilidad_monto: {
          type: "score",
          score: 2.0, // 2 / 3 = 0.6667 -> peso 0.25 = 16.67
          confidence: 0.8,
          legend: {},
          probabilities: { "0": 0, "1": 0.2, "2": 0.6, "3": 0.2 },
        },
        compatibilidad_requisitos: {
          type: "score",
          score: 3.0, // 3 / 3 = 1.0 -> peso 0.25 = 25
          confidence: 0.9,
          legend: {},
          probabilities: { "0": 0, "1": 0, "2": 0, "3": 1 },
        },
        recomendacion: {
          type: "choice",
          choice: "tal_vez",
          confidence: 0.75,
          probabilities: { si: 0.2, no: 0.1, tal_vez: 0.7 },
        },
      },
      usage: { input_tokens: 150, output_tokens: 20 },
    };

    // 25 + 16.6667 + 25 = 66.6667 -> round = 67
    const mockClient = createMockTypeSafeClient(mockResponse);
    const client = new TypeSafeMatchingClient({ client: mockClient });

    const resultado = await client.generarMatching(perfil, licitacion);

    expect(resultado.puntaje).toBe(67);
    expect(resultado.recomendacion).toBe("tal_vez");
    expect(resultado.justificacion).toContain("Recomendación: Tal vez (confianza 75%)");
  });

  it("califica directamente una licitación sin análisis previo usando descripción e ítems", async () => {
    const licitacionSinAnalisis: LicitacionParaMatching = {
      nombre: "Suministro de Tuberías HDPE",
      descripcion: "Adquisición de cañerías y tubos de polietileno de alta densidad para red de agua potable.",
      nombreOrganismo: "Aguas Andinas",
      montoEstimado: 25000000,
      moneda: "CLP",
      regionUnidad: "Metropolitana",
      tipo: "LE",
      fechaCierre: new Date("2026-10-15"),
      items: [{ nombreProducto: "Tubo HDPE 110mm PN10", categoriaUnspsc: "40171500" }],
      analisis: null,
    };

    const mockResponse = {
      model: "jev-latest",
      answers: {
        afinidad_rubro: { type: "score", score: 2.8, confidence: 0.9, legend: {}, probabilities: {} },
        viabilidad_monto: { type: "score", score: 3.0, confidence: 0.95, legend: {}, probabilities: {} },
        compatibilidad_requisitos: { type: "score", score: 3.0, confidence: 0.9, legend: {}, probabilities: {} },
        recomendacion: { type: "choice", choice: "si", confidence: 0.92, probabilities: {} },
      },
      usage: { input_tokens: 120, output_tokens: 18 },
    };

    const mockClient = createMockTypeSafeClient(mockResponse);
    const client = new TypeSafeMatchingClient({ client: mockClient });

    const resultado = await client.generarMatching(perfil, licitacionSinAnalisis);

    expect(resultado.puntaje).toBeGreaterThanOrEqual(90);
    expect(resultado.recomendacion).toBe("si");
    expect(mockClient.systemOne).toHaveBeenCalledWith(
      expect.objectContaining({
        state: expect.objectContaining({
          licitacion: expect.objectContaining({
            descripcion: "Adquisición de cañerías y tubos de polietileno de alta densidad para red de agua potable.",
            items: expect.arrayContaining([expect.objectContaining({ producto: "Tubo HDPE 110mm PN10" })]),
          }),
        }),
      }),
      expect.anything()
    );
  });

  it("lanza ProcesoCanceladoError si la señal ya venía abortada", async () => {
    const mockClient = createMockTypeSafeClient({});
    const client = new TypeSafeMatchingClient({ client: mockClient });

    const abortController = new AbortController();
    abortController.abort();

    await expect(
      client.generarMatching(perfil, licitacion, {
        signal: abortController.signal,
        onToken: vi.fn(),
        onReintento: vi.fn(),
      })
    ).rejects.toBeInstanceOf(ProcesoCanceladoError);

    expect(mockClient.systemOne).not.toHaveBeenCalled();
  });

  it("traduce APIUserAbortError a ProcesoCanceladoError", async () => {
    const mockClient = {
      systemOne: vi.fn().mockRejectedValue(new APIUserAbortError("Request aborted")),
    } as unknown as TypeSafeClient;

    const client = new TypeSafeMatchingClient({ client: mockClient });

    await expect(client.generarMatching(perfil, licitacion)).rejects.toBeInstanceOf(ProcesoCanceladoError);
  });

  it("envuelve otros errores en TypeSafeApiError", async () => {
    const mockClient = {
      systemOne: vi.fn().mockRejectedValue(new Error("Network connection lost")),
    } as unknown as TypeSafeClient;

    const client = new TypeSafeMatchingClient({ client: mockClient });

    await expect(client.generarMatching(perfil, licitacion)).rejects.toBeInstanceOf(TypeSafeApiError);
  });

  it("lanza error si se inicializa sin apiKey y no se provee cliente", () => {
    expect(() => new TypeSafeMatchingClient({ apiKey: "" })).toThrow(/TYPESAFE_API_KEY/);
  });
});
