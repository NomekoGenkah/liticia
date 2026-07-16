import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { ChileCompraClient, type RequestCounterPort } from "./chileCompraClient";

const OPCIONES = {
  ticket: "ticket-de-prueba",
  apiBase: "https://api.mercadopublico.cl/servicios/v1/publico",
  timeoutMs: 15000,
  retryMax: 0,
  retryBaseDelayMs: 1,
  maxRequestsDia: 500,
};

function crearCounter(contador: number, limiteDiario = 500) {
  return {
    obtener: vi.fn(async () => ({ contador, limiteDiario })),
    registrar: vi.fn(async () => {}),
  } satisfies RequestCounterPort;
}

function mockFetchOk() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Listado: [] }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ChileCompraClient — tope diario de requests", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("registra el request cuando hay cuota disponible", async () => {
    const counter = crearCounter(10);
    const fetchMock = mockFetchOk();

    await new ChileCompraClient(OPCIONES, counter).search({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(counter.registrar).toHaveBeenCalledTimes(1);
  });

  it("no consume cuota cuando el tope ya está alcanzado", async () => {
    // El bug que infló el contador a 1205 con ~500 llamadas reales: los intentos rechazados por el
    // propio guardarraíl igual sumaban, porque se incrementaba antes de chequear el tope.
    const counter = crearCounter(500);
    const fetchMock = mockFetchOk();

    await expect(new ChileCompraClient(OPCIONES, counter).search({})).rejects.toThrow(/tope local/);

    expect(counter.registrar).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permite exactamente el tope de requests, ni una más", async () => {
    mockFetchOk();

    // El 500º request (contador en 499) todavía pasa.
    const enElBorde = crearCounter(499);
    await expect(new ChileCompraClient(OPCIONES, enElBorde).search({})).resolves.toBeDefined();
    expect(enElBorde.registrar).toHaveBeenCalledTimes(1);

    // El 501º ya no.
    const pasado = crearCounter(500);
    await expect(new ChileCompraClient(OPCIONES, pasado).search({})).rejects.toThrow(/tope local/);
  });

  it("explica que el tope es local y cómo cambiarlo, sin culpar a ChileCompra", async () => {
    const counter = crearCounter(500);
    mockFetchOk();

    await expect(new ChileCompraClient(OPCIONES, counter).getDetail("1234-5-LE24")).rejects.toMatchObject({
      code: "LIMITE_LOCAL_REQUESTS",
      statusCode: 429,
      message: expect.stringContaining("No es un rechazo de ChileCompra"),
    });
    await expect(new ChileCompraClient(OPCIONES, counter).getDetail("1234-5-LE24")).rejects.toThrow(
      /CHILECOMPRA_MAX_REQUESTS_DIA/
    );
  });

  it("respeta el menor entre el tope configurado y el del contador", async () => {
    // maxRequestsDia 500 pero el contador reporta un límite de 100: manda el más restrictivo.
    const counter = crearCounter(100, 100);
    mockFetchOk();

    await expect(new ChileCompraClient(OPCIONES, counter).search({})).rejects.toThrow(/tope local de 100/);
  });
});
