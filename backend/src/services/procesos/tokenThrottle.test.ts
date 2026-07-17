import { describe, expect, it, vi } from "vitest";
import { TokenThrottle } from "./tokenThrottle";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("TokenThrottle", () => {
  it("agrupa varios tokens en un solo evento", async () => {
    const emitir = vi.fn();
    const throttle = new TokenThrottle(emitir);

    for (const letra of "hola mundo") throttle.push(letra, "respuesta");
    expect(emitir).not.toHaveBeenCalled();

    await esperar(150);

    expect(emitir).toHaveBeenCalledTimes(1);
    expect(emitir).toHaveBeenCalledWith("hola mundo", "respuesta");
  });

  it("mantiene separados los canales de respuesta y pensamiento", async () => {
    const emitir = vi.fn();
    const throttle = new TokenThrottle(emitir);

    throttle.push("razonando", "pensamiento");
    throttle.push("respondiendo", "respuesta");
    throttle.flush();

    expect(emitir).toHaveBeenCalledWith("respondiendo", "respuesta");
    expect(emitir).toHaveBeenCalledWith("razonando", "pensamiento");
  });

  it("flush() emite la cola pendiente: sin él se pierde el final del texto", async () => {
    const emitir = vi.fn();
    const throttle = new TokenThrottle(emitir);

    throttle.push("último trozo", "respuesta");
    throttle.flush();

    expect(emitir).toHaveBeenCalledWith("último trozo", "respuesta");
  });

  it("flush() es idempotente: no reemite lo que ya emitió", async () => {
    const emitir = vi.fn();
    const throttle = new TokenThrottle(emitir);

    throttle.push("hola", "respuesta");
    throttle.flush();
    throttle.flush();
    await esperar(150);

    expect(emitir).toHaveBeenCalledTimes(1);
  });

  it("descartar() tira lo acumulado sin emitirlo", async () => {
    // Lo que usa un reintento: la salida parcial del intento fallido no es válida y no debe
    // quedar pegada al texto del intento siguiente.
    const emitir = vi.fn();
    const throttle = new TokenThrottle(emitir);

    throttle.push("intento fallido", "respuesta");
    throttle.descartar();
    await esperar(150);

    expect(emitir).not.toHaveBeenCalled();
  });
});
