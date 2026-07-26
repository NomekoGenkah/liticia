import type { ModeloInstalado } from "../clients/ollamaAdminClient";

/**
 * Un modelo de chat recomendado. Es una lista CURADA, no un espejo del registro de Ollama: Ollama
 * no expone una API pública para navegar su catálogo, así que mantenemos a mano un puñado de
 * modelos que valen la pena para este uso (análisis/matching/RAG de licitaciones en español).
 */
export interface ModeloCatalogo {
  nombre: string;
  /** Tamaño aproximado del modelo cuantizado (≈ los pesos que ocupan VRAM). En MB. */
  tamañoMb: number;
  parametros: string;
  blurb: string;
  /** Destaque editorial (p. ej. el 4b para una GPU de 4GB, según el A/B). */
  recomendado?: boolean;
}

/**
 * Qué tan bien entra un modelo en el presupuesto de VRAM:
 * - holgado: los pesos dejan margen para el KV cache/contexto → corre entero en GPU, rápido.
 * - justo: entra pero sin aire → puede spillear contexto largo a RAM.
 * - no_entra: los pesos exceden la VRAM → offload parcial a CPU, lento.
 * - desconocido: sin presupuesto configurado, no se puede evaluar.
 */
export type Fit = "holgado" | "justo" | "no_entra" | "desconocido";

export interface ModeloConEstado extends ModeloCatalogo {
  instalado: boolean;
  fit: Fit;
}

const MB = 1024 * 1024;

/**
 * Catálogo curado de modelos de chat. Los tamaños son los de la cuantización por defecto que baja
 * Ollama (Q4_K_M para la familia qwen3), redondeados.
 */
export const CATALOGO_CHAT: ModeloCatalogo[] = [
  {
    nombre: "qwen3:1.7b",
    tamañoMb: 1400,
    parametros: "1.7B",
    blurb: "El más liviano de la familia. Para hardware muy ajustado; calidad justa en análisis.",
  },
  {
    nombre: "qwen3:4b",
    tamañoMb: 2500,
    parametros: "4B",
    blurb: "Recomendado para GPUs de 4GB: entra entero en VRAM, ~4.5x más rápido que el 8b y con una pérdida de calidad modesta (según el A/B).",
    recomendado: true,
  },
  {
    nombre: "qwen3:8b",
    tamañoMb: 5200,
    parametros: "8B",
    blurb: "Mejor calidad promedio, pero no entra en 4GB de VRAM (spillea a CPU y va lento). Ideal con 6GB+ de VRAM.",
  },
  {
    nombre: "llama3.2:3b",
    tamañoMb: 2000,
    parametros: "3B",
    blurb: "Alternativa liviana de Meta. Buen español general, entra cómodo en 4GB.",
  },
  {
    nombre: "gemma3:4b",
    tamañoMb: 3300,
    parametros: "4B",
    blurb: "Modelo de Google. Entra justo en 4GB; buena redacción en español.",
  },
];

/** Umbral: por debajo de este % del presupuesto, sobra lugar para el KV cache → "holgado". */
const HOLGADO_RATIO = 0.75;

function evaluarFit(tamañoMb: number, vramBudgetMb: number | null): Fit {
  if (vramBudgetMb === null) return "desconocido";
  if (tamañoMb <= vramBudgetMb * HOLGADO_RATIO) return "holgado";
  if (tamañoMb <= vramBudgetMb) return "justo";
  return "no_entra";
}

/**
 * Cruza el catálogo con lo que ya está instalado y evalúa el fit contra el presupuesto de VRAM.
 * Función pura (sin I/O): la ruta le pasa los instalados que trae `OllamaAdminClient.listar()`.
 *
 * Incluye también los modelos instalados que NO están en el catálogo (el usuario pudo bajar uno a
 * mano), usando su tamaño real. `instalados` NO debe incluir el modelo de embeddings: es la ruta la
 * que lo filtra, porque el selector es solo de modelos de chat.
 */
export function recomendarModelos(
  catalogo: ModeloCatalogo[],
  instalados: ModeloInstalado[],
  vramBudgetMb: number | null
): ModeloConEstado[] {
  const porNombre = new Map(instalados.map((m) => [m.nombre, m]));
  const enCatalogo = new Set(catalogo.map((m) => m.nombre));

  const delCatalogo: ModeloConEstado[] = catalogo.map((m) => ({
    ...m,
    instalado: porNombre.has(m.nombre),
    fit: evaluarFit(m.tamañoMb, vramBudgetMb),
  }));

  const instaladosExtra: ModeloConEstado[] = instalados
    .filter((m) => !enCatalogo.has(m.nombre))
    .map((m) => {
      const tamañoMb = Math.round(m.tamañoBytes / MB);
      return {
        nombre: m.nombre,
        tamañoMb,
        parametros: m.parametros ?? "?",
        blurb: "Instalado a mano (fuera del catálogo).",
        instalado: true,
        fit: evaluarFit(tamañoMb, vramBudgetMb),
      };
    });

  return [...delCatalogo, ...instaladosExtra];
}
