import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { iniciarEmbeddingPendientes, obtenerEstadoEmbedding } from "@/api/documentos";
import { ApiError } from "@/api/client";
import { useProcesoPolling } from "@/hooks/useProcesoPolling";

export function EmbeddingPanel() {
  const queryClient = useQueryClient();

  const { enProceso } = useProcesoPolling(["embedding-estado"], obtenerEstadoEmbedding, () => {
    toast.success("Generación de embeddings finalizada");
    queryClient.invalidateQueries({ queryKey: ["licitacion"] });
  });

  const mutation = useMutation({
    mutationFn: iniciarEmbeddingPendientes,
    onSuccess: () => {
      toast.info("Generación de embeddings iniciada en segundo plano");
      queryClient.invalidateQueries({ queryKey: ["embedding-estado"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "EMBEDDING_EN_PROCESO") {
        toast.error("Ya hay una generación de embeddings en curso.");
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudieron generar los embeddings");
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embeddings de documentos</CardTitle>
        <CardDescription>
          Indexa los documentos cargados que todavía no tienen fragmentos, para poder hacerles preguntas desde el
          detalle de cada licitación.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button className="w-fit" disabled={enProceso || mutation.isPending} onClick={() => mutation.mutate()}>
          {enProceso ? "Generando…" : "Generar embeddings"}
        </Button>
        {enProceso && (
          <p className="text-sm text-muted-foreground">Hay un batch de embeddings corriendo en el servidor.</p>
        )}
      </CardContent>
    </Card>
  );
}
