import type { OllamaClient } from "./ollamaClient";
import type {
  LicitacionParaMatching,
  MatchingLlmResultado,
  PerfilEmpresaParaMatching,
} from "./ollamaClient.types";
import type { MatchingClient } from "./matchingClient.interface";
import { buildMatchingPrompt } from "../services/matchingPrompt";
import type { OpcionesItem } from "../types/procesos";

/**
 * Adaptador de Ollama para el contrato de MatchingClient.
 */
export class OllamaMatchingClient implements MatchingClient {
  constructor(
    private readonly ollamaClient: OllamaClient,
    public readonly modelo: string
  ) {}

  async generarMatching(
    perfil: PerfilEmpresaParaMatching,
    licitacion: LicitacionParaMatching,
    opts?: OpcionesItem
  ): Promise<MatchingLlmResultado> {
    const prompt = buildMatchingPrompt(perfil, licitacion);
    return this.ollamaClient.generarMatching(prompt, opts);
  }
}
