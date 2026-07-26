import { Router } from "express";
import { z } from "zod";
import { OllamaAdminClient } from "../clients/ollamaAdminClient";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { configuracionIaService } from "../services/configuracionIaService";
import { detectarHardware } from "../services/hardwareService";
import { CATALOGO_CHAT, recomendarModelos } from "../services/llmCatalogo";

const adminClient = new OllamaAdminClient(config.OLLAMA_URL);

/** El modelo de embeddings no es una opción de chat: se filtra de la lista del selector. */
function esEmbed(nombre: string): boolean {
  return nombre === config.OLLAMA_EMBED_MODEL || nombre.startsWith(`${config.OLLAMA_EMBED_MODEL}:`);
}

const putSchema = z.object({
  proveedor: z.enum(["OLLAMA", "CLOUD"]).default("OLLAMA"),
  modeloChat: z.string().min(1).nullable().optional(),
  vramBudgetMb: z.coerce.number().int().positive().nullable().optional(),
  ramBudgetMb: z.coerce.number().int().positive().nullable().optional(),
});

const pullSchema = z.object({ model: z.string().min(1) });

export const configuracionIaRouter = Router();

configuracionIaRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await configuracionIaService.obtener());
  } catch (err) {
    next(err);
  }
});

configuracionIaRouter.put("/", async (req, res, next) => {
  try {
    const body = putSchema.parse(req.body ?? {});
    const guardado = await configuracionIaService.guardar({
      proveedor: body.proveedor,
      modeloChat: body.modeloChat ?? null,
      vramBudgetMb: body.vramBudgetMb ?? null,
      ramBudgetMb: body.ramBudgetMb ?? null,
    });
    res.json(guardado);
  } catch (err) {
    next(err);
  }
});

configuracionIaRouter.get("/hardware", async (_req, res, next) => {
  try {
    res.json(await detectarHardware());
  } catch (err) {
    next(err);
  }
});

/**
 * Lista de modelos de chat (catálogo curado + instalados), con su fit contra el presupuesto de
 * VRAM. El presupuesto efectivo es el configurado a mano, o si no hay, la VRAM autodetectada.
 */
configuracionIaRouter.get("/modelos", async (_req, res, next) => {
  try {
    const [instalados, cfg] = await Promise.all([adminClient.listar(), configuracionIaService.obtener()]);
    const instaladosChat = instalados.filter((m) => !esEmbed(m.nombre));

    const vramBudgetMb = cfg.vramBudgetMb ?? (await detectarHardware()).vramMb;
    const modelos = recomendarModelos(CATALOGO_CHAT, instaladosChat, vramBudgetMb);

    res.json({ modelos, vramBudgetMb, modeloChatActivo: cfg.modeloChatActivo });
  } catch (err) {
    next(err);
  }
});

/**
 * Descarga un modelo emitiendo el progreso como SSE. Reutiliza el patrón del stream de /procesos:
 * text/event-stream + no-transform, y depende de `server.requestTimeout = 0` para no cortar a los
 * 5 minutos. El frontend consume este stream con fetch()+reader (es un POST, no un EventSource).
 */
configuracionIaRouter.post("/modelos/pull", async (req, res, next) => {
  let model: string;
  try {
    model = pullSchema.parse(req.body ?? {}).model;
  } catch (err) {
    next(err);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  // Aborta la descarga en Ollama si el cliente cierra la pestaña/cancela. Se escucha en `res`, no
  // en `req`: este es un POST con body, y `req` emite "close" apenas express.json() termina de
  // leerlo, lo que abortaría la descarga antes de empezar. `res` "close" es la desconexión real.
  const abort = new AbortController();
  res.on("close", () => abort.abort());

  const enviar = (evento: object) => res.write(`data: ${JSON.stringify(evento)}\n\n`);

  try {
    for await (const progreso of adminClient.pull(model, abort.signal)) {
      enviar(progreso);
    }
    enviar({ status: "success", done: true });
  } catch (err) {
    if (!abort.signal.aborted) {
      logger.error({ err, model }, "Falló la descarga de modelo");
      enviar({ error: err instanceof Error ? err.message : String(err), done: true });
    }
  } finally {
    res.end();
  }
});

configuracionIaRouter.delete("/modelos/:nombre", async (req, res, next) => {
  try {
    await adminClient.eliminar(req.params.nombre);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
