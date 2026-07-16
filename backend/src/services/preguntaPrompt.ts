import type { PreguntaPrompt } from "../clients/ollamaClient";
import type { ChunkParaPregunta } from "../clients/ollamaClient.types";

export const PREGUNTA_PROMPT_VERSION = 1;

const SYSTEM_PROMPT = `Eres un asistente que responde preguntas sobre los documentos de una licitación pública chilena (Mercado Público / ChileCompra), para una empresa que evalúa si le conviene postular.

Reglas estrictas:
- Responde ÚNICAMENTE con información contenida en los fragmentos de documentos que se te entregan.
- Si los fragmentos no contienen la respuesta, dilo explícitamente ("Los documentos cargados no contienen esa información") en vez de inventarla o completarla con suposiciones.
- No uses conocimiento general sobre licitaciones para rellenar lo que no esté escrito en los fragmentos.
- Los fragmentos vienen numerados: puedes referirte a ellos como [1], [2], etc.
- Responde en español, en prosa breve (2 a 5 oraciones), sin formato Markdown.`;

function formatFragmentos(chunks: ChunkParaPregunta[]): string {
  return chunks
    .map(
      (chunk, indice) =>
        `[${indice + 1}] (${chunk.nombreArchivo}, fragmento ${chunk.chunkIndex})\n${chunk.contenido}`
    )
    .join("\n\n---\n\n");
}

export function buildPreguntaPrompt(pregunta: string, chunks: ChunkParaPregunta[]): PreguntaPrompt {
  const user = `Fragmentos de los documentos de la licitación:

${formatFragmentos(chunks)}

---

Pregunta: ${pregunta}`;

  return { system: SYSTEM_PROMPT, user };
}
