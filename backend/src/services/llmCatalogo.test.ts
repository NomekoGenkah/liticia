import { describe, expect, it } from "vitest";
import type { ModeloInstalado } from "../clients/ollamaAdminClient";
import { type ModeloCatalogo, recomendarModelos } from "./llmCatalogo";

const CATALOGO: ModeloCatalogo[] = [
  { nombre: "chico:2b", tamañoMb: 2000, parametros: "2B", blurb: "chico" },
  { nombre: "grande:8b", tamañoMb: 5200, parametros: "8B", blurb: "grande", recomendado: true },
];

function instalado(nombre: string, tamañoBytes: number): ModeloInstalado {
  return { nombre, tamañoBytes, familia: null, parametros: null, cuantizacion: null };
}

describe("recomendarModelos", () => {
  it("evalúa el fit contra el presupuesto de VRAM", () => {
    const res = recomendarModelos(CATALOGO, [], 4096);
    const chico = res.find((m) => m.nombre === "chico:2b");
    const grande = res.find((m) => m.nombre === "grande:8b");

    // 2000 <= 4096*0.75 (3072) → holgado; 5200 > 4096 → no entra.
    expect(chico?.fit).toBe("holgado");
    expect(grande?.fit).toBe("no_entra");
  });

  it("marca 'justo' cuando entra pero sin margen para el KV cache", () => {
    // 3300 está entre 4096*0.75 (3072) y 4096 → justo.
    const res = recomendarModelos([{ nombre: "medio:4b", tamañoMb: 3300, parametros: "4B", blurb: "" }], [], 4096);
    expect(res[0]?.fit).toBe("justo");
  });

  it("devuelve 'desconocido' sin presupuesto configurado", () => {
    const res = recomendarModelos(CATALOGO, [], null);
    expect(res.every((m) => m.fit === "desconocido")).toBe(true);
  });

  it("marca los modelos ya instalados", () => {
    const res = recomendarModelos(CATALOGO, [instalado("chico:2b", 2000 * 1024 * 1024)], 4096);
    expect(res.find((m) => m.nombre === "chico:2b")?.instalado).toBe(true);
    expect(res.find((m) => m.nombre === "grande:8b")?.instalado).toBe(false);
  });

  it("incluye los instalados fuera del catálogo con su tamaño real", () => {
    const res = recomendarModelos(CATALOGO, [instalado("custom:7b", 4000 * 1024 * 1024)], 8192);
    const custom = res.find((m) => m.nombre === "custom:7b");
    expect(custom).toBeDefined();
    expect(custom?.instalado).toBe(true);
    expect(custom?.tamañoMb).toBe(4000);
    expect(custom?.fit).toBe("holgado"); // 4000 <= 8192*0.75
  });

  it("preserva el flag 'recomendado' del catálogo", () => {
    const res = recomendarModelos(CATALOGO, [], 8192);
    expect(res.find((m) => m.nombre === "grande:8b")?.recomendado).toBe(true);
  });
});
