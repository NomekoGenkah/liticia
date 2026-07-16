import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { iniciarMatchingPendientes, obtenerEstadoMatching } from "@/api/matching";
import { ApiError } from "@/api/client";
import { useProcesoPolling } from "@/hooks/useProcesoPolling";

export function MatchingPanel() {
  const queryClient = useQueryClient();

  const { enProceso } = useProcesoPolling(["matching-estado"], obtenerEstadoMatching, () => {
    toast.success("Matching de licitaciones pendientes finalizado");
    queryClient.invalidateQueries({ queryKey: ["licitaciones"] });
  });

  const mutation = useMutation({
    mutationFn: iniciarMatchingPendientes,
    onSuccess: () => {
      toast.info("Matching de pendientes iniciado en segundo plano");
      queryClient.invalidateQueries({ queryKey: ["matching-estado"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "MATCHING_EN_PROCESO") toast.error("Ya hay un matching en curso.");
      else if (err instanceof ApiError && err.code === "PERFIL_EMPRESA_REQUERIDO") toast.error("Configura tu perfil de empresa primero.");
      else toast.error(err instanceof Error ? err.message : "No se pudo iniciar el matching");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matching IA</CardTitle>
        <CardDescription>
          Matchea contra tu perfil todas las licitaciones activas con análisis completado y sin matching vigente.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button className="w-fit" disabled={enProceso || mutation.isPending} onClick={() => mutation.mutate()}>
          {enProceso ? "Matcheando…" : "Matchear pendientes"}
        </Button>
        {enProceso && <p className="text-sm text-muted-foreground">Hay un batch de matching corriendo en el servidor.</p>}
      </CardContent>
    </Card>
  );
}
