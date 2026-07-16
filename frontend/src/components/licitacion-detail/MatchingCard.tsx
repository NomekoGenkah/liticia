import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { generarMatching } from "@/api/licitaciones";
import { obtenerEstadoMatching } from "@/api/matching";
import { ApiError } from "@/api/client";
import { useProcesoPolling } from "@/hooks/useProcesoPolling";
import type { LicitacionAnalisis, LicitacionMatching } from "@/types/api";

const ETIQUETAS_RECOMENDACION: Record<string, string> = { SI: "Sí, postular", TAL_VEZ: "Tal vez", NO: "No postular" };

export function MatchingCard({
  codigoExterno,
  matching,
  analisis,
}: {
  codigoExterno: string;
  matching: LicitacionMatching | null;
  analisis: LicitacionAnalisis | null;
}) {
  const queryClient = useQueryClient();
  const { enProceso } = useProcesoPolling(["matching-estado"], obtenerEstadoMatching);

  const mutation = useMutation({
    mutationFn: () => generarMatching(codigoExterno),
    onSuccess: () => {
      toast.success("Matching generado correctamente");
      queryClient.invalidateQueries({ queryKey: ["licitacion", codigoExterno] });
      queryClient.invalidateQueries({ queryKey: ["licitaciones"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "MATCHING_EN_PROCESO") {
        toast.error("Ya hay un matching en curso, espera a que termine.");
      } else if (err instanceof ApiError && err.code === "ANALISIS_REQUERIDO") {
        toast.error("Primero hay que generar el análisis de esta licitación.");
      } else if (err instanceof ApiError && err.code === "PERFIL_EMPRESA_REQUERIDO") {
        toast.error("Configura tu perfil de empresa antes de matchear.");
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo generar el matching");
      }
    },
  });

  const analisisListo = analisis?.estado === "COMPLETADO";
  const puedeGenerar = !matching || matching.estado === "FALLIDO";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matching con tu perfil</CardTitle>
        {puedeGenerar && (
          <CardAction>
            <Button
              size="sm"
              disabled={enProceso || mutation.isPending || !analisisListo}
              onClick={() => mutation.mutate()}
              title={!analisisListo ? "Genera primero el análisis de esta licitación" : undefined}
            >
              {mutation.isPending ? "Generando…" : matching ? "Reintentar matching" : "Generar matching"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!analisisListo && !matching && (
          <p className="text-sm text-muted-foreground">Necesitas un análisis completado antes de poder matchear.</p>
        )}

        {analisisListo && !matching && <p className="text-sm text-muted-foreground">Esta licitación todavía no tiene matching.</p>}

        {matching?.estado === "FALLIDO" && (
          <p className="text-sm text-destructive">
            El último intento falló{matching.detalleError ? `: ${matching.detalleError}` : "."}
          </p>
        )}

        {matching?.estado === "COMPLETADO" && (
          <>
            <div className="flex items-center gap-2">
              {matching.recomendacion && <Badge>{ETIQUETAS_RECOMENDACION[matching.recomendacion]}</Badge>}
              {matching.puntaje !== null && <span className="text-sm text-muted-foreground">Puntaje: {matching.puntaje}/100</span>}
            </div>
            {matching.justificacion && <p className="text-sm">{matching.justificacion}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
