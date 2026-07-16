export interface ChunkOptions {
  tamañoObjetivoChars?: number;
  solapeChars?: number;
}

/**
 * 3000 chars son ~750 tokens con el ratio optimista del BPE en español (4.0 chars/token) y ~1000
 * con el pesimista (3.0). Ambos extremos caben en la ventana de 2048 tokens de nomic-embed-text,
 * así que el chunk nunca se trunca sin importar el ratio real del texto — por eso no hace falta
 * un tokenizador acá: no buscamos precisión, buscamos una cota superior segura.
 */
const TAMAÑO_OBJETIVO_CHARS = 3000;

/** ~13% del objetivo: suficiente para que una idea a caballo entre dos chunks sobreviva entera. */
const SOLAPE_CHARS = 400;

/** De mayor a menor: párrafos (PDF/DOCX), líneas (filas de XLSX), oraciones, palabras. */
const SEPARADORES = ["\n\n", "\n", ". ", " "];

/**
 * Parte el texto en piezas de a lo más `maxChars`, bajando de separador solo cuando una pieza
 * sigue excediendo el máximo. Preserva los separadores, así que las piezas concatenadas
 * reconstruyen el texto original.
 */
function dividirEnPiezas(texto: string, maxChars: number, nivel = 0): string[] {
  if (texto.length <= maxChars) return [texto];

  const separador = SEPARADORES[nivel];
  if (separador === undefined) {
    // Agotamos los separadores: una sola palabra más larga que el máximo. Corte duro.
    const piezas: string[] = [];
    for (let i = 0; i < texto.length; i += maxChars) piezas.push(texto.slice(i, i + maxChars));
    return piezas;
  }

  const partes = texto.split(separador);
  const piezas: string[] = [];

  for (const [i, parte] of partes.entries()) {
    const pieza = i === partes.length - 1 ? parte : parte + separador;
    if (pieza.length === 0) continue;

    if (pieza.length > maxChars) piezas.push(...dividirEnPiezas(pieza, maxChars, nivel + 1));
    else piezas.push(pieza);
  }

  return piezas;
}

/** Últimos `solape` chars, recortados hacia adelante hasta un borde de palabra. */
function colaParaSolape(texto: string, solape: number): string {
  if (solape <= 0) return "";

  const cola = texto.slice(-solape);
  const primerEspacio = cola.search(/\s/);

  return primerEspacio === -1 ? cola : cola.slice(primerEspacio + 1);
}

/**
 * Parte un texto en chunks solapados aptos para embeber. Pura y determinista: el `chunkIndex` de
 * cada chunk es su posición en el array.
 *
 * Empaqueta piezas completas en vez de deslizar una ventana de N chars, que cortaría filas de
 * XLSX y oraciones a la mitad.
 *
 * Invariante: ningún chunk supera `tamañoObjetivoChars`. Depende de él `truncate: false` en
 * OllamaClient.generarEmbedding — si se rompe, Ollama rechaza el lote en vez de embeber texto
 * truncado en silencio.
 */
export function chunkText(texto: string, opciones: ChunkOptions = {}): string[] {
  const objetivo = opciones.tamañoObjetivoChars ?? TAMAÑO_OBJETIVO_CHARS;
  // Clamp: con solape >= objetivo, cada chunk arrancaría ya lleno y no avanzaría nunca.
  const solape = Math.max(0, Math.min(opciones.solapeChars ?? SOLAPE_CHARS, Math.floor(objetivo / 2)));

  const normalizado = texto.replace(/\r\n/g, "\n").trim();
  if (normalizado.length === 0) return [];

  // Las piezas se acotan a `objetivo - solape` para que un chunk que arranca con el solape de su
  // antecesor siga cabiendo en `objetivo` al sumarle una pieza entera.
  const piezas = dividirEnPiezas(normalizado, objetivo - solape);

  const chunks: string[] = [];
  let actual = "";

  for (const pieza of piezas) {
    if (actual.length > 0 && actual.length + pieza.length > objetivo) {
      chunks.push(actual.trim());
      actual = colaParaSolape(actual, solape);
    }
    actual += pieza;
  }

  const ultimo = actual.trim();
  if (ultimo.length > 0) chunks.push(ultimo);

  return chunks.filter((chunk) => chunk.length > 0);
}
