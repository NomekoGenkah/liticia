import { logger } from "../../config/logger";
import type { procesoRunRepository } from "../../repositories/procesoRunRepository";
import type {
  DefinicionProceso,
  EstadoProceso,
  ItemActual,
  PlanProceso,
  ProcesoDisparador,
  ProcesoItemEstado,
  ProcesoRunEstado,
  ResumenProceso,
  RunVivo,
  SeleccionProceso,
  VistaPreviaProceso,
} from "../../types/procesos";
import { ConflictError, ProcesoCanceladoError, UnprocessableEntityError } from "../../utils/errors";
import { procesoEventBus } from "./procesoEventBus";
import { TokenThrottle } from "./tokenThrottle";

/**
 * Corre un proceso de IA sobre una cola de ítems, uno por vez, con lock, cancelación, progreso en
 * vivo y persistencia del run.
 *
 * Es genérico porque análisis, matching y embeddings solo se diferencian en qué se planifica y cómo
 * se procesa un ítem — todo lo demás (que es casi todo) era copy-paste triplicado.
 */
export class ProcesoRunner<TItem, TCtx> {
  private enProceso = false;
  private controller: AbortController | null = null;
  /** Sobrevive al fin del run: el panel sigue mostrando el resultado cuando ya no corre nada. */
  private vivo: RunVivo | null = null;

  constructor(
    private readonly def: DefinicionProceso<TItem, TCtx>,
    private readonly runRepo: typeof procesoRunRepository
  ) {}

  /**
   * Sincrónico y solo de memoria, a propósito: el handler SSE manda el snapshot y se suscribe al bus
   * en el mismo tick, así que no hay ventana en la que se pierda un evento.
   *
   * Copia en vez de devolver `this.vivo`: es un snapshot, y uno que muta bajo los pies de quien lo
   * tiene no lo es. Hoy todos los consumidores lo serializan al instante y no notarían la
   * diferencia, pero el precio de la copia es un objeto chico y el de la trampa es un bug raro.
   */
  estado(): EstadoProceso {
    return {
      enProceso: this.enProceso,
      run: this.vivo && { ...this.vivo, actual: this.vivo.actual && { ...this.vivo.actual } },
    };
  }

  /**
   * Qué haría un run si se disparara ahora, ya en la forma en que se muestra. Sin lock y sin
   * escribir nada.
   *
   * Devuelve descriptores y no los TItem crudos: el llamador no tiene por qué conocer el tipo
   * interno de cada proceso (y tampoco podría — un runner sacado del registry por su slug es una
   * unión de los tres, y correlacionar el item con su describir() desde afuera es imposible).
   */
  async vistaPrevia(seleccion: SeleccionProceso): Promise<VistaPreviaProceso> {
    const plan = await this.def.planificar(seleccion);

    return {
      items: plan.items.map((item) => this.def.describir(item)),
      omitidos: plan.omitidos,
      parametros: plan.parametros,
    };
  }

  /** Dispara el run y vuelve apenas está creado, con el total real. El loop sigue en background. */
  async iniciar(
    seleccion: SeleccionProceso,
    disparadoPor: ProcesoDisparador
  ): Promise<{ runId: string; totalEncontradas: number }> {
    const { runId, totalEncontradas, correr } = await this.arrancar(seleccion, disparadoPor);

    void correr().catch((err) => logger.error({ err, runId }, "El loop del run falló de forma inesperada"));

    return { runId, totalEncontradas };
  }

  /** Ejecuta el run y espera a que termine. Para el CLI. */
  async ejecutar(seleccion: SeleccionProceso, disparadoPor: ProcesoDisparador): Promise<ResumenProceso> {
    const { correr } = await this.arrancar(seleccion, disparadoPor);
    return correr();
  }

  /** Aborta la generación en curso. Devuelve el runId cancelado, o null si no había nada corriendo. */
  cancelar(): string | null {
    if (!this.enProceso || !this.controller || !this.vivo) return null;

    logger.info({ runId: this.vivo.id, tipo: this.def.tipo }, "Cancelación solicitada");
    this.controller.abort(new ProcesoCanceladoError());
    return this.vivo.id;
  }

  private async arrancar(seleccion: SeleccionProceso, disparadoPor: ProcesoDisparador) {
    if (this.enProceso) {
      throw new ConflictError(
        `Ya hay un proceso de ${this.def.tipo} en curso, espera a que termine antes de disparar otro`,
        "PROCESO_EN_PROCESO"
      );
    }
    // Antes de cualquier await: en un event loop de un solo hilo, esta línea ES el lock.
    this.enProceso = true;

    try {
      if (await this.runRepo.hayRunActivo(this.def.tipo)) {
        throw new ConflictError(
          `Ya hay un proceso de ${this.def.tipo} en curso en otro proceso (¿un script de CLI?)`,
          "PROCESO_EN_PROCESO"
        );
      }

      // Planificar antes de crear el run es lo que hace que sus errores salgan por HTTP: si el
      // matching no tiene perfil, el usuario recibe un 422 en vez de un 202 y un run que no hace nada.
      const plan = await this.def.planificar(seleccion);

      // Nada que hacer y hay un motivo concreto. Es lo que convierte el run de 1 del detalle en el
      // 422 ANALISIS_REQUERIDO de siempre, en vez de un run vacío que el usuario mira sin entender.
      if (plan.items.length === 0 && plan.omitidos.length > 0) {
        const primero = plan.omitidos[0]!;
        throw new UnprocessableEntityError(primero.motivo, primero.codigo);
      }

      const descriptores = plan.items.map((item) => this.def.describir(item));
      const run = await this.runRepo.crear({
        tipo: this.def.tipo,
        disparadoPor,
        modelo: this.def.modelo(),
        parametros: plan.parametros,
        items: descriptores,
        omitidos: plan.omitidos,
      });

      this.controller = new AbortController();
      this.vivo = {
        id: run.id,
        tipo: this.def.tipo,
        estado: "EN_PROCESO",
        fechaInicio: run.fechaInicio.toISOString(),
        fechaFin: null,
        total: plan.items.length,
        completadas: 0,
        fallidas: 0,
        omitidos: plan.omitidos.length,
        objetoIds: descriptores.map((d) => d.objetoId),
        actual: null,
        detalleError: null,
      };

      logger.info(
        { runId: run.id, tipo: this.def.tipo, total: plan.items.length, omitidos: plan.omitidos.length },
        "Run iniciado"
      );
      procesoEventBus.emitir({ tipo: this.def.tipo, evento: "run-iniciado", run: this.vivo });

      return {
        runId: run.id,
        totalEncontradas: plan.items.length,
        correr: () => this.correr(run.id, plan),
      };
    } catch (err) {
      // El lock se suelta si la planificación falla: si no, un 422 dejaría el proceso trabado.
      this.enProceso = false;
      throw err;
    }
  }

  private async correr(runId: string, plan: PlanProceso<TItem, TCtx>): Promise<ResumenProceso> {
    const vivo = this.vivo!;
    const señal = this.controller!.signal;
    let estadoFinal: ProcesoRunEstado = "COMPLETADO";
    let detalleError: string | null = null;

    try {
      for (const [indice, item] of plan.items.entries()) {
        if (señal.aborted) {
          estadoFinal = "CANCELADO";
          break;
        }

        const descriptor = this.def.describir(item);
        const inicio = Date.now();
        const actual: ItemActual = {
          indice,
          ...descriptor,
          fechaInicio: new Date().toISOString(),
          texto: "",
          pensamiento: "",
        };
        vivo.actual = actual;

        await this.runRepo.marcarItemEnProceso(runId, indice);
        procesoEventBus.emitir({ tipo: this.def.tipo, evento: "item-iniciado", actual });

        const throttle = new TokenThrottle((texto, canal) =>
          procesoEventBus.emitir({ tipo: this.def.tipo, evento: "token", texto, canal })
        );

        try {
          const resultado = await this.def.procesar(item, plan.ctx, {
            signal: señal,
            onToken: (texto, canal) => {
              // El acumulado va al snapshot (una pestaña que llega tarde ve todo el texto); el
              // delta va al bus, agrupado cada 100ms.
              if (canal === "respuesta") actual.texto += texto;
              else actual.pensamiento += texto;
              throttle.push(texto, canal);
            },
            onReintento: (intento) => {
              // La salida parcial del intento fallido no es válida: si no se descarta, queda
              // pegada al texto del intento siguiente.
              actual.texto = "";
              actual.pensamiento = "";
              throttle.descartar();
              procesoEventBus.emitir({ tipo: this.def.tipo, evento: "item-reintentado", intento });
            },
          });

          if (resultado === "OMITIDO") vivo.omitidos++;
          else vivo.completadas++;

          await this.runRepo.cerrarItem(runId, indice, {
            estado: resultado,
            duracionMs: Date.now() - inicio,
            detalleError: null,
          });
          this.emitirItemFinalizado(indice, descriptor, resultado, Date.now() - inicio, null);
        } catch (err) {
          if (err instanceof ProcesoCanceladoError) {
            // La licitación vuelve a la cola: procesar() no persistió nada para ella.
            await this.runRepo.cerrarItem(runId, indice, {
              estado: "CANCELADO",
              duracionMs: Date.now() - inicio,
              detalleError: null,
            });
            this.emitirItemFinalizado(indice, descriptor, "CANCELADO", Date.now() - inicio, null);
            estadoFinal = "CANCELADO";
            break;
          }

          vivo.fallidas++;
          const mensaje = err instanceof Error ? err.message : String(err);
          await this.runRepo.cerrarItem(runId, indice, {
            estado: "FALLIDO",
            duracionMs: Date.now() - inicio,
            detalleError: mensaje,
          });
          this.emitirItemFinalizado(indice, descriptor, "FALLIDO", Date.now() - inicio, mensaje);
          logger.error({ err, ...descriptor, tipo: this.def.tipo }, "Ítem falló dentro del run");
        } finally {
          // Sin esto se pierde la cola del texto: lo que el modelo escribió en los últimos <100ms.
          throttle.flush();
        }
      }
    } catch (err) {
      estadoFinal = "FALLIDO";
      detalleError = err instanceof Error ? err.message : String(err);
      logger.error({ err, runId, tipo: this.def.tipo }, "El run falló fuera del procesamiento de un ítem");
    } finally {
      vivo.actual = null;
      vivo.estado = estadoFinal;
      vivo.fechaFin = new Date().toISOString();
      vivo.detalleError = detalleError;

      // Aislado: un error de base acá no puede dejar el lock tomado para siempre.
      try {
        await this.runRepo.cerrar(runId, { ...this.resumen(), estado: estadoFinal, detalleError });
        if (estadoFinal !== "COMPLETADO") await this.runRepo.cancelarItemsPendientes(runId);
      } catch (err) {
        logger.error({ err, runId }, "No se pudo cerrar el ProcesoRun en la base");
      }

      logger.info({ runId, tipo: this.def.tipo, estado: estadoFinal, ...this.resumen() }, "Run finalizado");
      procesoEventBus.emitir({
        tipo: this.def.tipo,
        evento: "run-finalizado",
        runId,
        estado: estadoFinal,
        completadas: vivo.completadas,
        fallidas: vivo.fallidas,
        omitidos: vivo.omitidos,
        detalleError,
      });

      this.controller = null;
      this.enProceso = false;
    }

    return this.resumen();
  }

  private emitirItemFinalizado(
    indice: number,
    descriptor: { objetoId: string; etiqueta: string },
    estado: ProcesoItemEstado,
    duracionMs: number,
    detalleError: string | null
  ): void {
    const vivo = this.vivo!;
    procesoEventBus.emitir({
      tipo: this.def.tipo,
      evento: "item-finalizado",
      indice,
      objetoId: descriptor.objetoId,
      etiqueta: descriptor.etiqueta,
      estado,
      duracionMs,
      detalleError,
      completadas: vivo.completadas,
      fallidas: vivo.fallidas,
      omitidos: vivo.omitidos,
    });
  }

  private resumen(): ResumenProceso {
    const vivo = this.vivo!;
    return {
      totalEncontradas: vivo.total,
      totalCompletadas: vivo.completadas,
      totalFallidas: vivo.fallidas,
      totalOmitidos: vivo.omitidos,
    };
  }
}
