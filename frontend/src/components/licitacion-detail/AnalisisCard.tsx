import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { generarAnalisis } from "@/api/licitaciones";
import { ApiError } from "@/api/client";
import { ProcesoPanelVivo } from "@/components/procesos/ProcesoPanelVivo";
import { keyEstadoProceso, useProcesoEstado } from "@/hooks/useProcesoEventos";
import type { LicitacionAnalisis } from "@/types/api";

const ETIQUETAS_COMPLEJIDAD: Record<string, string> = { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta" };

const ERRORES: Record<string, string> = {
  PROCESO_EN_PROCESO: "Ya hay un análisis en curso, espera a que termine.",
};

export function AnalisisCard({
  licitacionId,
  codigoExterno,
  analisis,
}: {
  licitacionId: string;
  codigoExterno: string;
  analisis: LicitacionAnalisis | null;
}) {
  const queryClient = useQueryClient();
  const { data: estado } = useProcesoEstado("ANALISIS");

  const mutation = useMutation({
    mutationFn: () => generarAnalisis(codigoExterno),
    // Sin toast de éxito: el 202 solo dice que arrancó, y el panel de abajo ya lo muestra.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyEstadoProceso("ANALISIS") }),
    onError: (err) => {
      const mensaje = err instanceof ApiError ? ERRORES[err.code] : undefined;
      toast.error(mensaje ?? (err instanceof Error ? err.message : "No se pudo generar el análisis"));
    },
  });

  // El panel en vivo solo si el run que corre incluye a ESTA licitación: si no, el detalle mostraría
  // el avance de un batch de 140 ajenas.
  const enEsteRun = Boolean(estado?.enProceso && estado.run?.objetoIds.includes(licitacionId));
  const otroRunEnCurso = Boolean(estado?.enProceso) && !enEsteRun;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análisis IA</CardTitle>
        <CardAction>
          <Button
            size="sm"
            disabled={estado?.enProceso || mutation.isPending}
            onClick={() => mutation.mutate()}
            title={otroRunEnCurso ? "Hay otro análisis corriendo: espera a que termine" : undefined}
          >
            {analisis?.estado === "COMPLETADO" ? "Regenerar análisis" : analisis ? "Reintentar análisis" : "Generar análisis"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {enEsteRun && <ProcesoPanelVivo tipo="ANALISIS" />}

        {!analisis && !enEsteRun && (
          <p className="text-sm text-muted-foreground">Esta licitación todavía no tiene análisis.</p>
        )}

        {analisis?.estado === "FALLIDO" && (
          <p className="text-sm text-destructive">
            El último intento falló{analisis.detalleError ? `: ${analisis.detalleError}` : "."}
          </p>
        )}

        {analisis?.estado === "COMPLETADO" && (
          <>
            {analisis.nivelComplejidad && (
              <Badge variant="secondary" className="w-fit">
                Complejidad {ETIQUETAS_COMPLEJIDAD[analisis.nivelComplejidad]}
              </Badge>
            )}
            {analisis.resumenEjecutivo && <p className="text-sm">{analisis.resumenEjecutivo}</p>}

            {analisis.puntosClave.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Puntos clave</p>
                <ul className="list-inside list-disc text-sm">
                  {analisis.puntosClave.map((punto, i) => (
                    <li key={i}>{punto}</li>
                  ))}
                </ul>
              </div>
            )}

            {analisis.palabrasClave.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {analisis.palabrasClave.map((palabra) => (
                  <Badge key={palabra} variant="outline">
                    {palabra}
                  </Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
