import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import type { procesoRunRepository } from "../../repositories/procesoRunRepository";
import type { DefinicionProceso, ItemOmitido, ProcesoEvento } from "../../types/procesos";
import { ConflictError, ProcesoCanceladoError, UnprocessableEntityError } from "../../utils/errors";
import { procesoEventBus } from "./procesoEventBus";
import { ProcesoRunner } from "./procesoRunner";

interface ItemFalso {
  id: string;
  nombre: string;
}

const item = (id: string): ItemFalso => ({ id, nombre: `Licitación ${id}` });

type Procesar = DefinicionProceso<ItemFalso, void>["procesar"];
type Planificar = DefinicionProceso<ItemFalso, void>["planificar"];

const plan = (items: ItemFalso[], omitidos: ItemOmitido[] = []) => ({
  items,
  omitidos,
  ctx: undefined,
  parametros: { modo: "PENDIENTES" } as const,
});

function crearMocks(overrides: Partial<DefinicionProceso<ItemFalso, void>> = {}) {
  const procesar = vi.fn<Procesar>(async () => "COMPLETADO");
  const planificar = vi.fn<Planificar>(async () => plan([item("a"), item("b")]));

  const def: DefinicionProceso<ItemFalso, void> = {
    tipo: "ANALISIS",
    modelo: () => "qwen3:8b",
    planificar,
    describir: (i) => ({ objetoId: i.id, etiqueta: i.id.toUpperCase(), titulo: i.nombre, subtitulo: null }),
    procesar,
    ...overrides,
  };

  const runRepo = {
    crear: vi.fn(async () => ({ id: "run-1", fechaInicio: new Date("2026-07-16T12:00:00Z") })),
    marcarItemEnProceso: vi.fn(async () => ({})),
    cerrarItem: vi.fn(async () => ({})),
    cerrar: vi.fn(async () => ({})),
    cancelarItemsPendientes: vi.fn(async () => ({ count: 0 })),
    hayRunActivo: vi.fn(async () => false),
  } as unknown as typeof procesoRunRepository;

  const runner = new ProcesoRunner<ItemFalso, void>(def, runRepo);

  return { runner, runRepo, procesar, planificar, def };
}

/** Junta todo lo que sale por el bus durante el test. */
function capturarEventos() {
  const eventos: ProcesoEvento[] = [];
  const desuscribir = procesoEventBus.suscribir((e) => eventos.push(e));
  return { eventos, desuscribir };
}

describe("ProcesoRunner", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("lock", () => {
    it("rechaza un segundo run del mismo tipo mientras hay uno corriendo", async () => {
      const { runner, procesar } = crearMocks();
      let liberar!: () => void;
      procesar.mockImplementationOnce(() => new Promise((resolve) => (liberar = () => resolve("COMPLETADO"))));

      await runner.iniciar({ modo: "PENDIENTES" }, "MANUAL");

      await expect(runner.iniciar({ modo: "PENDIENTES" }, "MANUAL")).rejects.toBeInstanceOf(ConflictError);

      liberar();
    });

    it("rechaza si otro proceso ya tiene un run activo en la base (el CLI y el servidor)", async () => {
      const { runner, runRepo } = crearMocks();
      vi.mocked(runRepo.hayRunActivo).mockResolvedValueOnce(true);

      await expect(runner.iniciar({ modo: "PENDIENTES" }, "MANUAL")).rejects.toMatchObject({
        code: "PROCESO_EN_PROCESO",
      });
    });

    it("suelta el lock si planificar() falla, para no dejar el proceso trabado", async () => {
      const { runner, planificar } = crearMocks();
      planificar.mockRejectedValueOnce(new UnprocessableEntityError("sin perfil", "PERFIL_EMPRESA_REQUERIDO"));

      await expect(runner.iniciar({ modo: "PENDIENTES" }, "MANUAL")).rejects.toMatchObject({
        code: "PERFIL_EMPRESA_REQUERIDO",
      });

      expect(runner.estado().enProceso).toBe(false);
      // Y el siguiente intento tiene que poder arrancar.
      await expect(runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL")).resolves.toBeDefined();
    });

    it("suelta el lock al terminar el run", async () => {
      const { runner } = crearMocks();

      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(runner.estado().enProceso).toBe(false);
    });
  });

  describe("plan vacío", () => {
    it("convierte 'todo omitido' en un 422 con el código del primer omitido", async () => {
      // Es lo que hace que pedir el matching de una licitación sin análisis siga dando el
      // ANALISIS_REQUERIDO de siempre, en vez de un run vacío que el usuario mira sin entender.
      const { runner, planificar } = crearMocks();
      planificar.mockResolvedValueOnce(
        plan([], [
          {
            objetoId: "a",
            etiqueta: "A",
            titulo: null,
            subtitulo: null,
            motivo: "no tiene análisis",
            codigo: "ANALISIS_REQUERIDO",
          },
        ])
      );

      await expect(runner.iniciar({ modo: "IDS", ids: ["a"] }, "MANUAL")).rejects.toMatchObject({
        code: "ANALISIS_REQUERIDO",
        statusCode: 422,
      });
    });

    it("un plan sin ítems y sin omitidos es un run válido que no hace nada", async () => {
      const { runner, planificar } = crearMocks();
      planificar.mockResolvedValueOnce(plan([]));

      const resumen = await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(resumen).toEqual({
        totalEncontradas: 0,
        totalCompletadas: 0,
        totalFallidas: 0,
        totalOmitidos: 0,
      });
    });
  });

  describe("loop", () => {
    it("continúa tras un error por ítem y agrega los contadores", async () => {
      const { runner, procesar, planificar } = crearMocks();
      planificar.mockResolvedValueOnce(plan([item("a"), item("b"), item("c")]));
      procesar
        .mockResolvedValueOnce("COMPLETADO")
        .mockRejectedValueOnce(new Error("falla puntual"))
        .mockResolvedValueOnce("COMPLETADO");

      const resumen = await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(resumen).toMatchObject({ totalEncontradas: 3, totalCompletadas: 2, totalFallidas: 1 });
    });

    it("cuenta los OMITIDO aparte de los COMPLETADO", async () => {
      const { runner, procesar } = crearMocks();
      procesar.mockResolvedValueOnce("OMITIDO").mockResolvedValueOnce("COMPLETADO");

      const resumen = await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(resumen).toMatchObject({ totalCompletadas: 1, totalOmitidos: 1, totalFallidas: 0 });
    });

    it("cierra el run como COMPLETADO y persiste el resumen", async () => {
      const { runner, runRepo } = crearMocks();

      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(runRepo.cerrar).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ estado: "COMPLETADO", totalCompletadas: 2, detalleError: null })
      );
    });

    it("cierra el run como FALLIDO si algo revienta fuera del procesamiento de un ítem", async () => {
      const { runner, runRepo } = crearMocks();
      vi.mocked(runRepo.marcarItemEnProceso).mockRejectedValueOnce(new Error("base caída"));

      const resumen = await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(runRepo.cerrar).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({ estado: "FALLIDO", detalleError: "base caída" })
      );
      expect(resumen.totalCompletadas).toBe(0);
    });

    it("no deja el lock tomado si falla el cierre en la base", async () => {
      const { runner, runRepo } = crearMocks();
      vi.mocked(runRepo.cerrar).mockRejectedValueOnce(new Error("base caída"));

      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(runner.estado().enProceso).toBe(false);
    });
  });

  describe("cancelación", () => {
    it("cancelar() sin nada corriendo devuelve null", () => {
      const { runner } = crearMocks();
      expect(runner.cancelar()).toBeNull();
    });

    it("corta el loop, no procesa el resto y cierra el run como CANCELADO", async () => {
      const { runner, procesar, planificar, runRepo } = crearMocks();
      planificar.mockResolvedValueOnce(plan([item("a"), item("b"), item("c")]));

      // El primer ítem se cancela a sí mismo, como haría el usuario apretando el botón.
      procesar.mockImplementationOnce(async () => {
        runner.cancelar();
        throw new ProcesoCanceladoError();
      });

      const resumen = await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      // Lo esencial: el ítem cancelado NO cuenta como fallido, y los otros dos ni se tocan.
      expect(procesar).toHaveBeenCalledTimes(1);
      expect(resumen).toMatchObject({ totalCompletadas: 0, totalFallidas: 0 });
      expect(runRepo.cerrarItem).toHaveBeenCalledWith(
        "run-1",
        0,
        expect.objectContaining({ estado: "CANCELADO", detalleError: null })
      );
      expect(runRepo.cerrar).toHaveBeenCalledWith("run-1", expect.objectContaining({ estado: "CANCELADO" }));
      expect(runRepo.cancelarItemsPendientes).toHaveBeenCalledWith("run-1");
    });

    it("le pasa a procesar() un signal que se aborta al cancelar", async () => {
      const { runner, procesar } = crearMocks();
      let señal: AbortSignal | undefined;

      procesar.mockImplementationOnce(async (_i: unknown, _ctx: unknown, opts: { signal: AbortSignal }) => {
        señal = opts.signal;
        expect(señal.aborted).toBe(false);
        runner.cancelar();
        expect(señal.aborted).toBe(true);
        throw new ProcesoCanceladoError();
      });

      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(señal).toBeDefined();
    });
  });

  describe("eventos", () => {
    it("emite run-iniciado, item-iniciado, item-finalizado y run-finalizado en orden", async () => {
      const { runner, planificar } = crearMocks();
      planificar.mockResolvedValueOnce(plan([item("a")]));

      const { eventos, desuscribir } = capturarEventos();
      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");
      desuscribir();

      expect(eventos.map((e) => e.evento)).toEqual([
        "run-iniciado",
        "item-iniciado",
        "item-finalizado",
        "run-finalizado",
      ]);
    });

    it("los eventos de ítem llevan los contadores acumulados, no deltas", async () => {
      // Así una pestaña que se perdió un evento se auto-corrige en el siguiente, sin replay.
      const { runner, procesar, planificar } = crearMocks();
      planificar.mockResolvedValueOnce(plan([item("a"), item("b")]));
      procesar.mockRejectedValueOnce(new Error("falla")).mockResolvedValueOnce("COMPLETADO");

      const { eventos, desuscribir } = capturarEventos();
      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");
      desuscribir();

      const finalizados = eventos.filter((e) => e.evento === "item-finalizado");
      expect(finalizados[0]).toMatchObject({ estado: "FALLIDO", fallidas: 1, completadas: 0 });
      expect(finalizados[1]).toMatchObject({ estado: "COMPLETADO", fallidas: 1, completadas: 1 });
    });

    it("reemite los tokens que emite el modelo", async () => {
      const { runner, procesar, planificar } = crearMocks();
      planificar.mockResolvedValueOnce(plan([item("a")]));
      procesar.mockImplementationOnce(async (_i, _ctx, opts) => {
        opts.onToken('{"resumen', "respuesta");
        opts.onToken("Ejecutivo", "respuesta");
        // El throttle agrupa cada 100ms; hay que esperarlo o el flush() final lo emite junto.
        await new Promise((r) => setTimeout(r, 150));
        return "COMPLETADO";
      });

      const { eventos, desuscribir } = capturarEventos();
      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");
      desuscribir();

      const tokens = eventos.filter((e) => e.evento === "token");
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({ texto: '{"resumenEjecutivo', canal: "respuesta" });
    });
  });

  describe("estado()", () => {
    it("expone el progreso del run en curso", async () => {
      const { runner, procesar } = crearMocks();
      let estadoEnMedio: ReturnType<typeof runner.estado> | undefined;

      procesar.mockImplementationOnce(async () => {
        estadoEnMedio = runner.estado();
        return "COMPLETADO" as const;
      });

      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(estadoEnMedio).toMatchObject({
        enProceso: true,
        run: expect.objectContaining({
          id: "run-1",
          total: 2,
          objetoIds: ["a", "b"],
          actual: expect.objectContaining({ indice: 0, etiqueta: "A", titulo: "Licitación a" }),
        }),
      });
    });

    it("conserva el resumen del último run cuando ya no corre nada", async () => {
      const { runner } = crearMocks();

      await runner.ejecutar({ modo: "PENDIENTES" }, "MANUAL");

      expect(runner.estado()).toMatchObject({
        enProceso: false,
        run: expect.objectContaining({ estado: "COMPLETADO", completadas: 2, actual: null }),
      });
    });
  });
});
