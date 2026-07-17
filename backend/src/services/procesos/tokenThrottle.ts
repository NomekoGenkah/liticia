import type { CanalToken } from "../../types/procesos";

/** ~10 eventos/s: por debajo del umbral en que el ojo distingue saltos, y ~30× menos que por token. */
const INTERVALO_MS = 100;

const CANALES: CanalToken[] = ["respuesta", "pensamiento"];

/**
 * Agrupa los tokens que emite el modelo antes de mandarlos por SSE.
 *
 * Un evento por token serían ~200 mensajes por licitación y otros tantos re-renders en cada
 * pestaña, para un texto que igual se lee a la velocidad a la que se escribe.
 */
export class TokenThrottle {
  private readonly buffers: Record<CanalToken, string> = { respuesta: "", pensamiento: "" };
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly emitir: (texto: string, canal: CanalToken) => void) {}

  push(texto: string, canal: CanalToken): void {
    this.buffers[canal] += texto;
    // Timer trailing y no leading: que el primer token también espere los 100ms es lo correcto —
    // un evento por el primero y otro por los 30 siguientes es peor que uno solo por los 31.
    this.timer ??= setTimeout(() => this.flush(), INTERVALO_MS);
  }

  /** Descarta lo acumulado sin emitirlo. Para cuando un reintento invalida la salida parcial. */
  descartar(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const canal of CANALES) this.buffers[canal] = "";
  }

  /** Idempotente. Obligatorio al terminar un ítem: si no, se pierde el último buffer. */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const canal of CANALES) {
      if (this.buffers[canal]) {
        this.emitir(this.buffers[canal], canal);
        this.buffers[canal] = "";
      }
    }
  }
}
