import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { generarAnalisis } from "@/api/licitaciones";
import { obtenerEstadoAnalisis } from "@/api/analisis";
import { ApiError } from "@/api/client";
import { useProcesoPolling } from "@/hooks/useProcesoPolling";
import type { LicitacionAnalisis } from "@/types/api";

const ETIQUETAS_COMPLEJIDAD: Record<string, string> = { BAJA: "Baja", MEDIA: "Media", ALTA: "Alta" };

export function AnalisisCard({ codigoExterno, analisis }: { codigoExterno: string; analisis: LicitacionAnalisis | null }) {
  const queryClient = useQueryClient();
  const { enProceso } = useProcesoPolling(["analisis-estado"], obtenerEstadoAnalisis);

  const mutation = useMutation({
    mutationFn: () => generarAnalisis(codigoExterno),
    onSuccess: () => {
      toast.success("Análisis generado correctamente");
      queryClient.invalidateQueries({ queryKey: ["licitacion", codigoExterno] });
      queryClient.invalidateQueries({ queryKey: ["licitaciones"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "ANALISIS_EN_PROCESO") {
        toast.error("Ya hay un análisis en curso, espera a que termine.");
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo generar el análisis");
      }
    },
  });

  const puedeGenerar = !analisis || analisis.estado === "FALLIDO";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análisis IA</CardTitle>
        {puedeGenerar && (
          <CardAction>
            <Button size="sm" disabled={enProceso || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Generando…" : analisis ? "Reintentar análisis" : "Generar análisis"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!analisis && <p className="text-sm text-muted-foreground">Esta licitación todavía no tiene análisis.</p>}

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
