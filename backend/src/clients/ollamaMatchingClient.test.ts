import { describe, it, expect, vi } from "vitest";
import { OllamaMatchingClient } from "./ollamaMatchingClient";
import type { OllamaClient } from "./ollamaClient";
import type { LicitacionParaMatching, PerfilEmpresaParaMatching } from "./ollamaClient.types";

describe("OllamaMatchingClient", () => {
  const perfil: PerfilEmpresaParaMatching = {
    tipo: "EMPRESA",
    nombre: "Empresa Clima",
    descripcion: "Mantención de aire acondicionado",
    rubro: "Climatización",
    palabrasClave: ["aire", "clima"],
    categoriasUnspsc: ["72101507"],
    regionesInteres: ["Metropolitana"],
    montoMinimo: 1000000,
    montoMaximo: 20000000,
  };

  const licitacion: LicitacionParaMatching = {
    nombre: "Servicio de Climatización Hospital",
    nombreOrganismo: "Servicio de Salud",
    montoEstimado: 15000000,
    moneda: "CLP",
    regionUnidad: "Metropolitana",
    tipo: "LE",
    fechaCierre: new Date("2026-08-01"),
    analisis: {
      resumenEjecutivo: "Mantención de equipos de aire",
      puntosClave: ["Plazo 12 meses"],
      palabrasClave: ["climatización"],
      nivelComplejidad: "MEDIA",
    },
  };

  it("construye el prompt y delega la llamada a OllamaClient", async () => {
    const mockResultado = {
      puntaje: 90,
      recomendacion: "si" as const,
      justificacion: "Alta afinidad técnica.",
    };

    const mockOllama = {
      generarMatching: vi.fn().mockResolvedValue(mockResultado),
    } as unknown as OllamaClient;

    const client = new OllamaMatchingClient(mockOllama, "qwen3:8b");
    expect(client.modelo).toBe("qwen3:8b");

    const opts = { signal: new AbortController().signal, onToken: vi.fn(), onReintento: vi.fn() };
    const resultado = await client.generarMatching(perfil, licitacion, opts);

    expect(resultado).toEqual(mockResultado);
    expect(mockOllama.generarMatching).toHaveBeenCalledTimes(1);
    const [promptArg, optsArg] = (mockOllama.generarMatching as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(promptArg.user).toContain("Empresa Clima");
    expect(promptArg.user).toContain("Servicio de Climatización Hospital");
    expect(optsArg).toBe(opts);
  });
});
