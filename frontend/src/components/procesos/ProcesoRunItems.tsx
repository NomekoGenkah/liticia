import { useQuery } from "@tanstack/react-query";
import { obtenerProcesoRun } from "@/api/procesos";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuracion } from "@/lib/format";
import type { ProcesoItemEstado } from "@/types/procesos";

const VARIANTE: Record<ProcesoItemEstado, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETADO: "default",
  FALLIDO: "destructive",
  CANCELADO: "outline",
  OMITIDO: "outline",
  PENDIENTE: "secondary",
  EN_PROCESO: "secondary",
};

/**
 * Qué pasó con cada licitación de un run. Es la razón de existir del historial: los contadores
 * dicen "3 fallidas", esto dice cuáles y por qué.
 */
export function ProcesoRunItems({ runId }: { runId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["proceso-run", runId],
    queryFn: () => obtenerProcesoRun(runId),
    // El run ya terminó (o su estado vivo llega por el stream): no hay nada que refrescar.
    staleTime: Infinity,
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (isError || !data) return <p className="text-sm text-muted-foreground">No se pudo cargar el detalle del run.</p>;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Modelo: <span className="font-mono">{data.modelo}</span>
      </p>

      <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
        {data.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-mono text-xs">{item.etiqueta}</span>
              {item.titulo && <span className="truncate text-xs text-muted-foreground">{item.titulo}</span>}
              {item.detalleError && <span className="text-xs text-destructive">{item.detalleError}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {item.duracionMs !== null && (
                <span className="text-xs tabular-nums text-muted-foreground">{formatDuracion(item.duracionMs)}</span>
              )}
              <Badge variant={VARIANTE[item.estado]}>{item.estado}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
