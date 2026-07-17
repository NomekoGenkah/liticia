import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { ejecutarProceso } from "@/api/procesos";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { keyEstadoProceso, useProcesoEstado } from "@/hooks/useProcesoEventos";
import type { ProcesoTipo } from "@/types/procesos";
import { PendientesPreview } from "./PendientesPreview";
import { ProcesoPanelVivo } from "./ProcesoPanelVivo";

interface Copy {
  titulo: string;
  descripcion: string;
  accion: string;
  enCurso: string;
}

const COPY: Record<ProcesoTipo, Copy> = {
  ANALISIS: {
    titulo: "Análisis IA",
    descripcion:
      "Genera el resumen y la extracción de las licitaciones activas sin análisis vigente (o con el último intento fallido).",
    accion: "Analizar pendientes",
    enCurso: "Analizando…",
  },
  MATCHING: {
    titulo: "Matching IA",
    descripcion:
      "Compara contra tu perfil las licitaciones activas ya analizadas que no tengan un matching vigente.",
    accion: "Matchear pendientes",
    enCurso: "Matcheando…",
  },
  EMBEDDING: {
    titulo: "Embeddings de documentos",
    descripcion: "Indexa los documentos con texto extraído que todavía no se pueden consultar por chat.",
    accion: "Indexar pendientes",
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
  const copy = COPY[tipo];

  const ejecutar = useMutation({
    mutationFn: (ids?: string[]) => ejecutarProceso(tipo, ids),
    onSuccess: (resultado) => {
      if (resultado.totalEncontradas === 0) toast.info("No hay nada pendiente para procesar.");
      // Si hay trabajo no hace falta avisar nada: el panel se expande solo y se ve.
      queryClient.invalidateQueries({ queryKey: keyEstadoProceso(tipo) });
    },
    onError: (err) => {
      const mensaje = err instanceof ApiError ? ERRORES[err.code] : undefined;
      toast.error(mensaje ?? (err instanceof Error ? err.message : "No se pudo iniciar el proceso"));
    },
  });

  const enProceso = estado?.enProceso ?? false;
  const deshabilitado = enProceso || ejecutar.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.titulo}</CardTitle>
        <CardDescription>{copy.descripcion}</CardDescription>
        <CardAction>
          <Button size="sm" disabled={deshabilitado} onClick={() => ejecutar.mutate(undefined)}>
            {enProceso ? copy.enCurso : copy.accion}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ProcesoPanelVivo tipo={tipo} />
        {!enProceso && <PendientesPreview tipo={tipo} onEjecutar={(ids) => ejecutar.mutate(ids)} />}
      </CardContent>
    </Card>
  );
}
