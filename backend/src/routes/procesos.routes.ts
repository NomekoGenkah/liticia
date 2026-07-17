import { Router } from "express";
import { z } from "zod";
import { procesoRunRepository } from "../repositories/procesoRunRepository";
import { procesoEventBus } from "../services/procesos/procesoEventBus";
import { getRunner, runnerPorSlug } from "../services/procesos/registry";
import { TIPOS_PROCESO, type ProcesoEvento, type SeleccionProceso } from "../types/procesos";
import { ConflictError } from "../utils/errors";
import { paginationSchema } from "../utils/pagination";

/** Sin ids (o con la lista vacía) = los pendientes que elija el sistema, como siempre. */
const ejecutarBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).optional(),
});

const runsQuerySchema = paginationSchema.extend({
  tipo: z.enum(["ANALISIS", "MATCHING", "EMBEDDING"]).optional(),
});

const LATIDO_MS = 20_000;

export const procesosRouter = Router();

/**
 * Un solo stream para los tres tipos, en vez de uno por tipo.
 *
 * El navegador admite 6 conexiones HTTP/1.1 por origen: con un stream por tipo, los tres paneles de
 * la pantalla de Procesos se comerían la mitad del presupuesto con conexiones que no terminan
 * nunca, y las queries normales empezarían a hacer cola detrás. Cada evento lleva su `tipo`.
 */
procesosRouter.get("/eventos", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    // no-transform: hoy no hay compresión en app.ts, pero el día que alguien agregue `compression`
    // esta cabecera es lo único que evita que el stream quede buffereado y el panel en vivo se
    // congele sin un solo error en los logs.
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  // Cuánto espera el navegador antes de reconectar si se corta.
  res.write("retry: 3000\n\n");

  const enviar = (evento: ProcesoEvento) => res.write(`data: ${JSON.stringify(evento)}\n\n`);

  // Suscribir y mandar el snapshot en el mismo tick, sin await en el medio: estado() lee solo
  // memoria justamente para que no haya ventana en la que un evento se pierda.
  const desuscribir = procesoEventBus.suscribir(enviar);
  for (const tipo of TIPOS_PROCESO) {
    enviar({ tipo, evento: "snapshot", estado: getRunner(tipo).estado() });
  }

  // Sin latido, una conexión muerta (pestaña dormida, laptop suspendida) queda como listener
  // fantasma del bus hasta el próximo write, que puede tardar horas.
  const latido = setInterval(() => res.write(": ping\n\n"), LATIDO_MS);

  // El stream no se cierra cuando termina un run: es por tipo y de larga vida, no por run.
  // Cerrarlo dispararía la reconexión automática del EventSource y un snapshot al pedo cada vez.
  req.on("close", () => {
    clearInterval(latido);
    desuscribir();
    res.end();
  });
});

// Antes de /:tipo/*: hoy no colisionan (distinta cantidad de segmentos), pero es gratis blindarlo.
procesosRouter.get("/runs", async (req, res, next) => {
  try {
    const { tipo, ...pagination } = runsQuerySchema.parse(req.query);
    res.json(await procesoRunRepository.listar(pagination, tipo));
  } catch (err) {
    next(err);
  }
});

procesosRouter.get("/runs/:id", async (req, res, next) => {
  try {
    const run = await procesoRunRepository.obtener(req.params.id);
    if (!run) {
      res.status(404).json({ error: { message: `No existe el run ${req.params.id}`, code: "NOT_FOUND" } });
      return;
    }
    res.json(run);
  } catch (err) {
    next(err);
  }
});

procesosRouter.get("/:tipo/estado", (req, res, next) => {
  try {
    res.json(runnerPorSlug(req.params.tipo).estado());
  } catch (err) {
    next(err);
  }
});

/** Vista previa de lo que haría un run, para poder mirarlo antes de gastar horas de LLM. */
procesosRouter.get("/:tipo/pendientes", async (req, res, next) => {
  try {
    res.json(await runnerPorSlug(req.params.tipo).vistaPrevia({ modo: "PENDIENTES" }));
  } catch (err) {
    next(err);
  }
});

procesosRouter.post("/:tipo/ejecutar", async (req, res, next) => {
  try {
    const { ids } = ejecutarBodySchema.parse(req.body ?? {});
    const seleccion: SeleccionProceso = ids ? { modo: "IDS", ids } : { modo: "PENDIENTES" };

    const runner = runnerPorSlug(req.params.tipo);
    // El await es lo que hace que un error de planificación (sin perfil, sin análisis, id
    // inexistente) salga por HTTP en vez de morir en un log después de haber respondido 202.
    const { runId, totalEncontradas } = await runner.iniciar(seleccion, "MANUAL");

    res.status(202).json({ runId, tipo: req.params.tipo, totalEncontradas });
  } catch (err) {
    next(err);
  }
});

procesosRouter.post("/:tipo/cancelar", (req, res, next) => {
  try {
    const runId = runnerPorSlug(req.params.tipo).cancelar();
    if (!runId) throw new ConflictError("No hay ningún proceso corriendo para cancelar", "NO_HAY_PROCESO");

    res.status(202).json({ runId });
  } catch (err) {
    next(err);
  }
});
