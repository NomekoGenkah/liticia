import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { iniciarAnalisisPendientes, obtenerEstadoAnalisis } from "@/api/analisis";
import { ApiError } from "@/api/client";
import { useProcesoPolling } from "@/hooks/useProcesoPolling";

export function AnalisisPanel() {
  const queryClient = useQueryClient();

  const { enProceso } = useProcesoPolling(["analisis-estado"], obtenerEstadoAnalisis, () => {
    toast.success("Análisis de licitaciones pendientes finalizado");
    queryClient.invalidateQueries({ queryKey: ["licitaciones"] });
  });

  const mutation = useMutation({
    mutationFn: iniciarAnalisisPendientes,
    onSuccess: () => {
      toast.info("Análisis de pendientes iniciado en segundo plano");
      queryClient.invalidateQueries({ queryKey: ["analisis-estado"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "ANALISIS_EN_PROCESO") toast.error("Ya hay un análisis en curso.");
      else toast.error(err instanceof Error ? err.message : "No se pudo iniciar el análisis");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Análisis IA</CardTitle>
        <CardDescription>
          Analiza todas las licitaciones activas sin análisis vigente (o con el último intento fallido).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button className="w-fit" disabled={enProceso || mutation.isPending} onClick={() => mutation.mutate()}>
          {enProceso ? "Analizando…" : "Analizar pendientes"}
        </Button>
        {enProceso && <p className="text-sm text-muted-foreground">Hay un batch de análisis corriendo en el servidor.</p>}
      </CardContent>
    </Card>
  );
}
