import type { AnalisisPrompt, MatchingPrompt, OpcionesGeneracion, PreguntaPrompt } from "./ollamaClient";
import type { AnalisisLlmResultado, MatchingLlmResultado } from "./ollamaClient.types";

/**
 * El contrato de generación de chat que consumen los servicios de análisis, matching y RAG,
 * independiente de quién lo cumpla. Hoy lo implementa solo `OllamaClient` (modelo local); es el
 * seam por el que la Fase 2 podrá enchufar un `CloudLlmClient` (Anthropic/OpenAI) sin tocar los
 * servicios: pasan a depender de esta interfaz, no de una clase concreta.
 *
 * Deliberadamente NO incluye `generarEmbedding`: los embeddings quedan atados a Ollama y al modelo
 * de 768 dimensiones (la columna `vector(768)` lo exige), así que no son parte del contrato
 * intercambiable. Los servicios que además embeben (RAG, indexado) siguen dependiendo de
 * `OllamaClient` hasta que la Fase 2 separe el cliente de embeddings del de chat.
 */
export interface ChatLlmClient {
  generarAnalisis(prompt: AnalisisPrompt, opts?: OpcionesGeneracion): Promise<AnalisisLlmResultado>;
  generarMatching(prompt: MatchingPrompt, opts?: OpcionesGeneracion): Promise<MatchingLlmResultado>;
  generarRespuesta(prompt: PreguntaPrompt): Promise<string>;
}
