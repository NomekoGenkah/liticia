import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { ejecutarProceso } from "@/api/procesos";
import { Button } from "@/components/ui/button";
import { useProcesoEstado } from "@/hooks/useProcesoEventos";
import type { ProcesoTipo } from "@/types/procesos";

const ERRORES: Record<string, string> = {
  PROCESO_EN_PROCESO: "Ya hay un proceso de este tipo en curso.",
  PERFIL_EMPRESA_REQUERIDO: "Configura primero el perfil de empresa.",
  ANALISIS_REQUERIDO: "Ninguna de las seleccionadas tiene análisis todavía.",
};

interface Props {
  seleccion: Set<string>;
  onLimpiar: () => void;
}

/**
 * Acciones sobre las licitaciones tildadas. Aparece solo cuando hay alguna.
 *
 * Mandar ids explícitos hace que el backend NO aplique el prefiltro UNSPSC ni el predicado de
 * "pendiente": si las elegiste a mano, se procesan todas, incluso las ya analizadas.
 */
export function SeleccionBar({ seleccion, onLimpiar }: Props) {
  const navigate = useNavigate();
  const { data: estadoAnalisis } = useProcesoEstado("ANALISIS");
  const { data: estadoMatching } = useProcesoEstado("MATCHING");

  const ejecutar = useMutation({
    mutationFn: (tipo: ProcesoTipo) => ejecutarProceso(tipo, [...seleccion]),
    onSuccess: (resultado) => {
      onLimpiar();
      // El panel en vivo vive en Procesos: llevarlo ahí es más útil que un toast que se va solo.
      toast.success(`${resultado.totalEncontradas} en cola`, {
        action: { label: "Ver progreso", onClick: () => navigate("/procesos") },
      });
    },
    onError: (err) => {
      const mensaje = err instanceof ApiError ? ERRORES[err.code] : undefined;
      toast.error(mensaje ?? (err instanceof Error ? err.message : "No se pudo iniciar el proceso"));
    },
  });

  if (seleccion.size === 0) return null;

  const ocupado = ejecutar.isPending;

  return (
    // Sin backdrop-blur (ver el comentario de ui/dialog.tsx): la barra flota sobre una tabla que
    // scrollea, así que el filtro se re-rasterizaría en cada frame del scroll. A 95% de opacidad
    // tampoco se notaba.
    <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-full border bg-background/95 px-4 py-2 shadow-lg">
      <span className="text-sm font-medium tabular-nums">
        {seleccion.size} seleccionada{seleccion.size === 1 ? "" : "s"}
      </span>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={ocupado || estadoAnalisis?.enProceso}
          onClick={() => ejecutar.mutate("ANALISIS")}
          title={estadoAnalisis?.enProceso ? "Hay un análisis corriendo" : undefined}
        >
          Analizar
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={ocupado || estadoMatching?.enProceso}
          onClick={() => ejecutar.mutate("MATCHING")}
          title={estadoMatching?.enProceso ? "Hay un matching corriendo" : undefined}
        >
          Matchear
        </Button>
        {/* "Limpiar selección" y no "Limpiar": los filtros de arriba ya tienen su propio botón
            "Limpiar", y dos botones con el mismo nombre en pantalla no se distinguen. */}
        <Button size="sm" variant="ghost" onClick={onLimpiar}>
          Limpiar selección
        </Button>
      </div>
    </div>
  );
}
