import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { ejecutarProceso, obtenerPendientes } from "@/api/procesos";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { keyEstadoProceso, useProcesoEstado } from "@/hooks/useProcesoEventos";
import type { ProcesoTipo } from "@/types/procesos";
import { PendientesPreview } from "./PendientesPreview";
import { ProcesoPanelVivo } from "./ProcesoPanelVivo";

interface Copy {
  titulo: string;
  descripcion: string;
  /** El verbo del botón "todas". El conteo se le agrega aparte. */
  accion: string;
  enCurso: string;
}

const COPY: Record<ProcesoTipo, Copy> = {
  ANALISIS: {
    titulo: "Análisis IA",
    descripcion:
      "Genera el resumen y la extracción de las licitaciones activas sin análisis vigente (o con el último intento fallido).",
    accion: "Analizar todas",
    enCurso: "Analizando…",
  },
  MATCHING: {
    titulo: "Matching IA",
    descripcion:
      "Compara contra tu perfil las licitaciones activas ya analizadas que no tengan un matching vigente.",
    accion: "Matchear todas",
    enCurso: "Matcheando…",
  },
  EMBEDDING: {
    titulo: "Embeddings de documentos",
    descripcion: "Indexa los documentos con texto extraído que todavía no se pueden consultar por chat.",
    accion: "Indexar todas",
    enCurso: "Indexando…",
  },
};

const ERRORES: Record<string, string> = {
  PROCESO_EN_PROCESO: "Ya hay un proceso de este tipo en curso.",
  PERFIL_EMPRESA_REQUERIDO: "Configura primero el perfil de empresa.",
};

/**
 * Un panel por tipo de proceso: disparar, ver en vivo y cancelar.
 *
 * Reemplaza a AnalisisPanel/MatchingPanel/EmbeddingPanel, que eran el mismo archivo tres veces.
 */
export function ProcesoPanel({ tipo }: { tipo: ProcesoTipo }) {
  const queryClient = useQueryClient();
  const { data: estado } = useProcesoEstado(tipo);
  const [abierto, setAbierto] = useState(false);
  const copy = COPY[tipo];

  // Se pide siempre, no solo al abrir la vista previa: el botón de arriba muestra el conteo, y un
  // botón que dice "Analizar todas" sin decir cuántas son no responde la pregunta que importa.
  const {
    data: pendientes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["proceso-pendientes", tipo],
    queryFn: () => obtenerPendientes(tipo),
    // Un 422 acá es determinista (el matching sin perfil configurado): reintentarlo no lo arregla.
    retry: false,
  });

  const ejecutar = useMutation({
    // Sin ids = modo PENDIENTES: el servidor recalcula al arrancar, en vez de congelar una lista
    // que se pidió hace diez minutos. Con ids = exactamente esos.
    mutationFn: (ids?: string[]) => ejecutarProceso(tipo, ids),
    onSuccess: (resultado) => {
      if (resultado.totalEncontradas === 0) toast.info("No hay nada pendiente para procesar.");
      // Si hay trabajo no hace falta avisar nada: el panel se expande solo y se ve.
      setAbierto(false);
      queryClient.invalidateQueries({ queryKey: keyEstadoProceso(tipo) });
    },
    onError: (err) => {
      const mensaje = err instanceof ApiError ? ERRORES[err.code] : undefined;
      toast.error(mensaje ?? (err instanceof Error ? err.message : "No se pudo iniciar el proceso"));
    },
  });

  const enProceso = estado?.enProceso ?? false;
  const total = pendientes?.items.length;
  const nadaQueHacer = total === 0;

  // Sin perfil de empresa, planificar() el matching devuelve 422: es una condición del sistema, no
  // un error de red, y decirla acá es mejor que dejar que se descubra apretando el botón.
  const motivoBloqueo = error instanceof ApiError ? error.message : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.titulo}</CardTitle>
        <CardDescription>{copy.descripcion}</CardDescription>
        <CardAction>
          <Button
            size="sm"
            disabled={enProceso || ejecutar.isPending || isLoading || nadaQueHacer || Boolean(motivoBloqueo)}
            onClick={() => ejecutar.mutate(undefined)}
          >
            {enProceso ? copy.enCurso : total === undefined ? copy.accion : `${copy.accion} (${total})`}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ProcesoPanelVivo tipo={tipo} />

        {motivoBloqueo && <p className="text-sm text-muted-foreground">{motivoBloqueo}.</p>}

        {!enProceso && nadaQueHacer && <p className="text-sm text-muted-foreground">No hay nada pendiente.</p>}

        {!enProceso && pendientes && !nadaQueHacer && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-fit px-0 text-muted-foreground"
              onClick={() => setAbierto((previo) => !previo)}
            >
              {abierto ? "Ocultar" : "Elegir cuáles"}
            </Button>

            {abierto && (
              <PendientesPreview
                pendientes={pendientes}
                deshabilitado={ejecutar.isPending}
                onEjecutar={(ids) => ejecutar.mutate(ids)}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
