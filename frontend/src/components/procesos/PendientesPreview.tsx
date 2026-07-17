import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { VistaPreviaProceso } from "@/types/procesos";

interface Props {
  pendientes: VistaPreviaProceso;
  /** Los ids exactos que se eligieron. Nunca vacío: el botón se deshabilita antes. */
  onEjecutar: (ids: string[]) => void;
  deshabilitado: boolean;
}

/**
 * Qué licitaciones (o documentos) caerían en el batch, con la opción de elegir cuáles antes de
 * disparar. Responde "¿qué va a hacer esto si aprieto?" antes de comprometer horas de LLM.
 *
 * Manda siempre los ids explícitos, a diferencia del botón "todas" del panel, que manda el modo
 * PENDIENTES para que el servidor los recalcule al arrancar. Acá el botón dice un número concreto,
 * así que tiene que procesar exactamente ese.
 */
export function PendientesPreview({ pendientes, onEjecutar, deshabilitado }: Props) {
  /**
   * Se guardan los excluidos y no los seleccionados: así el default (nada excluido = todas
   * tildadas) no depende de esperar a que carguen los ítems para inicializarse.
   */
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());

  const alternar = (id: string) =>
    setExcluidos((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const seleccionados = pendientes.items.filter((item) => !excluidos.has(item.objetoId));
  const todasTildadas = excluidos.size === 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {seleccionados.length} de {pendientes.items.length} seleccionadas
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={todasTildadas}
            onClick={() => setExcluidos(new Set())}
          >
            Seleccionar todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={seleccionados.length === 0}
            onClick={() => setExcluidos(new Set(pendientes.items.map((item) => item.objetoId)))}
          >
            Deseleccionar todas
          </Button>
        </div>
      </div>

      <ul className="max-h-64 divide-y overflow-y-auto">
        {pendientes.items.map((item) => (
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
        disabled={deshabilitado || seleccionados.length === 0}
        onClick={() => onEjecutar(seleccionados.map((item) => item.objetoId))}
      >
        Procesar {seleccionados.length}
      </Button>

      {pendientes.omitidos.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-2">
          <span className="text-xs font-medium text-muted-foreground">
            {pendientes.omitidos.length} quedan afuera
          </span>
          {pendientes.omitidos.slice(0, 5).map((item) => (
            <span key={item.objetoId} className="truncate text-xs text-muted-foreground">
              {item.etiqueta} — {item.motivo}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
