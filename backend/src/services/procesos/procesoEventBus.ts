import { EventEmitter } from "node:events";
import type { ProcesoEvento } from "../../types/procesos";

/**
 * Bus en memoria entre los runners y las conexiones SSE. No persiste nada ni lo intenta: lo que
 * hay que sobrevivir a un reinicio ya vive en ProcesoRun.
 */
class ProcesoEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // El default de 10 dispara un warning de "possible EventEmitter memory leak" con varias
    // pestañas abiertas, sin que haya leak alguno: cada una es una conexión SSE legítima.
    this.emitter.setMaxListeners(50);
  }

  emitir(evento: ProcesoEvento): void {
    this.emitter.emit("evento", evento);
  }

  /** Devuelve la función de desuscripción: así es imposible suscribirse y olvidarse de limpiar. */
  suscribir(listener: (evento: ProcesoEvento) => void): () => void {
    this.emitter.on("evento", listener);
    return () => this.emitter.off("evento", listener);
  }
}

export const procesoEventBus = new ProcesoEventBus();
