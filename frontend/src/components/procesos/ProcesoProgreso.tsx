import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Progress, ProgressValue } from "@/components/ui/progress";
import { formatDuracion } from "@/lib/format";
import type { RunVivo } from "@/types/procesos";

/**
 * Cuánto falta, estimado a partir de lo que ya tardó.
 *
 * Hace falta al menos un ítem terminado: sin eso no hay ritmo que extrapolar, y un número inventado
 * en el primer segundo es peor que no mostrar nada.
 */
function estimarRestante(run: RunVivo): number | null {
  const hechas = run.completadas + run.fallidas + run.omitidos;
  if (hechas === 0 || hechas >= run.total) return null;

  const transcurrido = Date.now() - new Date(run.fechaInicio).getTime();
  return (run.total - hechas) * (transcurrido / hechas);
}

export function ProcesoProgreso({ run }: { run: RunVivo }) {
  const hechas = run.completadas + run.fallidas + run.omitidos;
  const porcentaje = run.total === 0 ? 100 : Math.round((hechas / run.total) * 100);
  const restante = run.estado === "EN_PROCESO" ? estimarRestante(run) : null;

  return (
    <div className="flex flex-col gap-2">
      <Progress value={porcentaje}>
        <span className="text-sm font-medium tabular-nums">
          {hechas} de {run.total}
        </span>
        {/* Base UI pasa el valor formateado a un render prop; acá el texto útil no es el número
            sino cuánto falta, así que se ignora. */}
        <ProgressValue>{() => (restante === null ? `${porcentaje}%` : `quedan ~${formatDuracion(restante)}`)}</ProgressValue>
      </Progress>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-500" />
          {run.completadas} completadas
        </span>
        {run.fallidas > 0 && (
          <span className="inline-flex items-center gap-1">
            <XCircle className="size-3.5 text-rose-600 dark:text-rose-500" />
            {run.fallidas} fallidas
          </span>
        )}
        {run.omitidos > 0 && (
          <span className="inline-flex items-center gap-1">
            <MinusCircle className="size-3.5" />
            {run.omitidos} omitidas
          </span>
        )}
      </div>
    </div>
  );
}
