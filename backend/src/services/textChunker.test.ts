import { describe, expect, it } from "vitest";
import { chunkText } from "./textChunker";

describe("chunkText", () => {
  it("devuelve un array vacío para texto vacío", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("devuelve un array vacío para texto de solo whitespace", () => {
    expect(chunkText("   \n\n  \t \r\n ")).toEqual([]);
  });

  it("devuelve un único chunk cuando el texto entra en el objetivo", () => {
    expect(chunkText("Las bases exigen una garantía de seriedad.")).toEqual([
      "Las bases exigen una garantía de seriedad.",
    ]);
  });

  it("nunca emite un chunk que supere el objetivo", () => {
    // El invariante del que depende `truncate: false` en generarEmbedding.
    const texto = Array.from({ length: 400 }, (_, i) => `Párrafo ${i} con relleno suficiente.`).join("\n\n");

    for (const chunk of chunkText(texto, { tamañoObjetivoChars: 500, solapeChars: 80 })) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it("mantiene el invariante de tamaño incluso sin ningún separador donde cortar", () => {
    const texto = "x".repeat(10_000);

    for (const chunk of chunkText(texto, { tamañoObjetivoChars: 500, solapeChars: 80 })) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it("no pierde texto al hacer corte duro sobre una palabra gigante", () => {
    const texto = "a".repeat(2500);
    const chunks = chunkText(texto, { tamañoObjetivoChars: 500, solapeChars: 0 });

    expect(chunks.join("")).toBe(texto);
  });

  it("parte en los límites de párrafo y no a mitad de oración", () => {
    const parrafos = ["Primer párrafo completo.", "Segundo párrafo completo.", "Tercer párrafo completo."];
    const chunks = chunkText(parrafos.join("\n\n"), { tamañoObjetivoChars: 30, solapeChars: 0 });

    for (const chunk of chunks) {
      expect(parrafos).toContain(chunk);
    }
  });

  it("arrastra la cola del chunk anterior como solape", () => {
    const texto = Array.from({ length: 30 }, (_, i) => `linea numero ${i}`).join("\n");
    const chunks = chunkText(texto, { tamañoObjetivoChars: 120, solapeChars: 40 });

    expect(chunks.length).toBeGreaterThan(1);

    // El arranque de cada chunk debe reaparecer dentro de su antecesor.
    for (let i = 1; i < chunks.length; i++) {
      const arranque = chunks[i]!.slice(0, 10);
      expect(chunks[i - 1]).toContain(arranque);
    }
  });

  it("no parte las filas de un XLSX por la mitad", () => {
    // Formato real de documentoExtractor: `=== Hoja ===` + filas con celdas separadas por tabs.
    const filas = Array.from({ length: 40 }, (_, i) => `Item ${i}\tUnidad\t${i * 10}`);
    const texto = `=== Presupuesto ===\n${filas.join("\n")}`;

    const chunks = chunkText(texto, { tamañoObjetivoChars: 200, solapeChars: 40 });

    // Cada fila debe sobrevivir entera dentro de algún chunk.
    for (const fila of filas) {
      expect(chunks.some((chunk) => chunk.includes(fila))).toBe(true);
    }
  });

  it("cubre todo el contenido del texto original", () => {
    const marcador = "CLAUSULA-UNICA-DE-CONTROL";
    const relleno = Array.from({ length: 50 }, (_, i) => `Relleno ${i}.`).join("\n\n");
    const texto = `${relleno}\n\n${marcador}\n\n${relleno}`;

    const chunks = chunkText(texto, { tamañoObjetivoChars: 300, solapeChars: 50 });

    expect(chunks.some((chunk) => chunk.includes(marcador))).toBe(true);
    expect(chunks[0]).toContain("Relleno 0.");
    expect(chunks.at(-1)).toContain("Relleno 49.");
  });

  it("termina aunque el solape pedido supere el objetivo", () => {
    // Sin el clamp, cada chunk arrancaría lleno y el empaquetado no avanzaría.
    const texto = Array.from({ length: 50 }, (_, i) => `linea ${i}`).join("\n");
    const chunks = chunkText(texto, { tamañoObjetivoChars: 100, solapeChars: 500 });

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(100);
  });

  it("no emite chunks vacíos ni con whitespace de sobra", () => {
    const texto = "Uno.\n\n\n\nDos.\n\n\n\nTres.";

    for (const chunk of chunkText(texto, { tamañoObjetivoChars: 10, solapeChars: 0 })) {
      expect(chunk).toBe(chunk.trim());
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("normaliza los saltos de línea de Windows", () => {
    expect(chunkText("Uno.\r\n\r\nDos.")).toEqual(["Uno.\n\nDos."]);
  });
});
