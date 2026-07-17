import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { obtenerPendientes } from "@/api/procesos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProcesoTipo } from "@/types/procesos";

interface Props {
  tipo: ProcesoTipo;
  /** Sin ids = correr los pendientes tal como los calcule el servidor al momento de arrancar. */
  onEjecutar: (ids?: string[]) => void;
}

/**
 * Qué licitaciones (o documentos) caerían en el batch, con la opción de destildar antes de
 * disparar. Responde "¿qué va a hacer esto si aprieto?" antes de comprometer horas de LLM.
 */
export function PendientesPreview({ tipo, onEjecutar }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["proceso-pendientes", tipo],
    queryFn: () => obtenerPendientes(tipo),
    enabled: abierto,
  });

  const alternar = (id: string) =>
    setExcluidos((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  if (!abierto) {
    return (
      <Button variant="ghost" size="sm" className="w-fit px-0 text-muted-foreground" onClick={() => setAbierto(true)}>
        Ver qué está pendiente
      </Button>
    );
  }

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        No se pudo calcular lo pendiente: {error instanceof Error ? error.message : "error desconocido"}
      </p>
    );
  }

  if (!data) return null;

  const seleccionados = data.items.filter((item) => !excluidos.has(item.objetoId));
  // Si no se destildó nada se manda sin ids, para que el servidor recalcule los pendientes al
  // arrancar en vez de congelar una lista que se pidió hace diez minutos.
  const idsAEnviar = excluidos.size === 0 ? undefined : seleccionados.map((item) => item.objetoId);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {data.items.length === 0 ? "No hay nada pendiente" : `${data.items.length} pendientes`}
          {excluidos.size > 0 && ` · ${seleccionados.length} seleccionadas`}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setAbierto(false)}>
          Ocultar
        </Button>
      </div>

      {data.items.length > 0 && (
        <>
          <ul className="max-h-64 divide-y overflow-y-auto">
            {data.items.map((item) => (
              <li key={item.objetoId} className="flex items-start gap-2 py-1.5">
                <Checkbox
                  className="mt-0.5"
                  checked={!excluidos.has(item.objetoId)}
                  onCheckedChange={() => alternar(item.objetoId)}
                  aria-label={`Incluir ${item.etiqueta}`}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-xs">{item.etiqueta}</span>
                  {item.titulo && <span className="truncate text-xs">{item.titulo}</span>}
                  {item.subtitulo && <span className="truncate text-xs text-muted-foreground">{item.subtitulo}</span>}
                </div>
              </li>
            ))}
          </ul>

          <Button
            size="sm"
            className="w-fit"
            disabled={seleccionados.length === 0}
            onClick={() => onEjecutar(idsAEnviar)}
          >
            {excluidos.size === 0 ? "Procesar todas" : `Procesar ${seleccionados.length} seleccionadas`}
          </Button>
        </>
      )}

      {data.omitidos.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-2">
          <span className="text-xs font-medium text-muted-foreground">{data.omitidos.length} quedan afuera</span>
          {data.omitidos.slice(0, 5).map((item) => (
            <span key={item.objetoId} className="truncate text-xs text-muted-foreground">
              {item.etiqueta} — {item.motivo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
