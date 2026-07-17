import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { cancelarProceso } from "@/api/procesos";
import { Button } from "@/components/ui/button";
import { keyEstadoProceso, useProcesoEstado } from "@/hooks/useProcesoEventos";
import { formatDuracion, formatFechaHora } from "@/lib/format";
import type { ProcesoRunEstado, ProcesoTipo } from "@/types/procesos";
import { Cronometro } from "./Cronometro";
import { ProcesoProgreso } from "./ProcesoProgreso";
import { StreamViewer } from "./StreamViewer";

const RESUMEN_FINAL: Record<Exclude<ProcesoRunEstado, "EN_PROCESO">, string> = {
  COMPLETADO: "Finalizado",
  CANCELADO: "Cancelado",
  FALLIDO: "Falló",
  INTERRUMPIDO: "Interrumpido: el servidor se reinició mientras corría",
};

/**
 * El estado en vivo de un proceso: progreso, qué se está procesando ahora, lo que el modelo va
 * escribiendo, y el botón de cancelar.
 *
 * Lee todo del caché por `tipo`, sin props: así el mismo componente sirve en la pantalla de
 * Procesos y dentro del detalle de una licitación, sin pasar nada por el medio.
 */
export function ProcesoPanelVivo({ tipo }: { tipo: ProcesoTipo }) {
  const queryClient = useQueryClient();
  const { data: estado } = useProcesoEstado(tipo);

  const cancelar = useMutation({
    mutationFn: () => cancelarProceso(tipo),
    onError: (err) => {
      // Si ya no había nada corriendo, el run terminó justo antes del clic: no es un error que
      // valga la pena mostrarle a nadie.
      if (err instanceof ApiError && err.code === "NO_HAY_PROCESO") {
        queryClient.invalidateQueries({ queryKey: keyEstadoProceso(tipo) });
        return;
      }
      toast.error(err instanceof Error ? err.message : "No se pudo cancelar");
    },
  });

  const run = estado?.run;
  if (!run) return null;

  const corriendo = estado.enProceso;
  const duracion = run.fechaFin ? new Date(run.fechaFin).getTime() - new Date(run.fechaInicio).getTime() : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            {corriendo ? "En curso" : RESUMEN_FINAL[run.estado as Exclude<ProcesoRunEstado, "EN_PROCESO">]}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatFechaHora(run.fechaInicio)}
            {duracion !== null && ` · duró ${formatDuracion(duracion)}`}
          </span>
        </div>

        {corriendo && (
          <Button
            size="sm"
            variant="outline"
            disabled={cancelar.isPending}
            onClick={() => cancelar.mutate()}
          >
            {cancelar.isPending ? "Cancelando…" : "Cancelar"}
          </Button>
        )}
      </div>

      <ProcesoProgreso run={run} />

      {run.actual && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                <span className="truncate">{run.actual.etiqueta}</span>
              </span>
              {run.actual.titulo && <span className="truncate text-xs">{run.actual.titulo}</span>}
              {run.actual.subtitulo && (
                <span className="truncate text-xs text-muted-foreground">{run.actual.subtitulo}</span>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              <Cronometro desde={run.actual.fechaInicio} />
            </span>
          </div>

          <StreamViewer tipo={tipo} />
        </div>
      )}

      {run.detalleError && <p className="text-xs text-destructive">{run.detalleError}</p>}
    </div>
  );
}
