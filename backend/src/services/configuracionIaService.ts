import { config } from "../config/env";
import { configuracionIaRepository, type ConfiguracionIaInput } from "../repositories/configuracionIaRepository";

/**
 * Caché en memoria del modelo de chat elegido. `null` significa "usar el default de entorno"
 * (`OLLAMA_MODEL`). Existe porque el thunk que consume `OllamaClient` es SÍNCRONO (ver
 * `OllamaClientOptions.model`): no puede ir a la DB en cada token. Se mantiene fresco por dos vías,
 * las únicas que cambian el modelo dentro de un proceso:
 *   1. `primeCache()` al arrancar el servidor (refleja lo persistido tras un reinicio).
 *   2. `guardar()` lo actualiza en el acto cuando el usuario cambia el modelo desde Ajustes.
 */
let modeloChatCache: string | null = null;

export interface ConfiguracionIaVista {
  proveedor: "OLLAMA" | "CLOUD";
  modeloChat: string | null;
  vramBudgetMb: number | null;
  ramBudgetMb: number | null;
  /** El modelo realmente en uso: el elegido, o el default de entorno si no hay elegido. */
  modeloChatActivo: string;
}

export const configuracionIaService = {
  /** Carga el modelo persistido al caché. Llamar una vez al arrancar el servidor. */
  async primeCache(): Promise<void> {
    const cfg = await configuracionIaRepository.obtener();
    modeloChatCache = cfg?.modeloChat ?? null;
  },

  /** El modelo de chat activo, resuelto sin I/O. Es lo que consumen el `OllamaClient` y los runners. */
  modeloChatActivo(): string {
    return modeloChatCache ?? config.OLLAMA_MODEL;
  },

  async obtener(): Promise<ConfiguracionIaVista> {
    const cfg = await configuracionIaRepository.obtener();
    return {
      proveedor: cfg?.proveedor ?? "OLLAMA",
      modeloChat: cfg?.modeloChat ?? null,
      vramBudgetMb: cfg?.vramBudgetMb ?? null,
      ramBudgetMb: cfg?.ramBudgetMb ?? null,
      modeloChatActivo: cfg?.modeloChat ?? config.OLLAMA_MODEL,
    };
  },

  async guardar(input: ConfiguracionIaInput): Promise<ConfiguracionIaVista> {
    const saved = await configuracionIaRepository.guardar(input);
    modeloChatCache = saved.modeloChat; // el cambio toma efecto sin reiniciar
    return {
      proveedor: saved.proveedor,
      modeloChat: saved.modeloChat,
      vramBudgetMb: saved.vramBudgetMb,
      ramBudgetMb: saved.ramBudgetMb,
      modeloChatActivo: saved.modeloChat ?? config.OLLAMA_MODEL,
    };
  },
};
