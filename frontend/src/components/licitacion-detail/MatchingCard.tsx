import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { generarMatching } from "@/api/licitaciones";
import { ApiError } from "@/api/client";
import { ProcesoPanelVivo } from "@/components/procesos/ProcesoPanelVivo";
import { keyEstadoProceso, useProcesoEstado } from "@/hooks/useProcesoEventos";
import type { LicitacionAnalisis, LicitacionMatching } from "@/types/api";

const ETIQUETAS_RECOMENDACION: Record<string, string> = { SI: "Sí, postular", TAL_VEZ: "Tal vez", NO: "No postular" };

const ERRORES: Record<string, string> = {
  PROCESO_EN_PROCESO: "Ya hay un matching en curso, espera a que termine.",
  ANALISIS_REQUERIDO: "Primero hay que generar el análisis de esta licitación.",
  PERFIL_EMPRESA_REQUERIDO: "Configura tu perfil de empresa antes de matchear.",
};

export function MatchingCard({
  licitacionId,
  codigoExterno,
  matching,
  analisis,
}: {
  licitacionId: string;
  codigoExterno: string;
  matching: LicitacionMatching | null;
  analisis: LicitacionAnalisis | null;
}) {
  const queryClient = useQueryClient();
  const { data: estado } = useProcesoEstado("MATCHING");

  const mutation = useMutation({
    mutationFn: () => generarMatching(codigoExterno),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyEstadoProceso("MATCHING") }),
    onError: (err) => {
      const mensaje = err instanceof ApiError ? ERRORES[err.code] : undefined;
      toast.error(mensaje ?? (err instanceof Error ? err.message : "No se pudo generar el matching"));
    },
  });

  const analisisListo = analisis?.estado === "COMPLETADO";
  const enEsteRun = Boolean(estado?.enProceso && estado.run?.objetoIds.includes(licitacionId));

  const motivoDeshabilitado = !analisisListo
    ? "Genera primero el análisis de esta licitación"
    : estado?.enProceso && !enEsteRun
      ? "Hay otro matching corriendo: espera a que termine"
      : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matching con tu perfil</CardTitle>
        <CardAction>
          <Button
            size="sm"
            disabled={estado?.enProceso || mutation.isPending || !analisisListo}
            onClick={() => mutation.mutate()}
            title={motivoDeshabilitado}
          >
            {matching?.estado === "COMPLETADO" ? "Regenerar matching" : matching ? "Reintentar matching" : "Generar matching"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {enEsteRun && <ProcesoPanelVivo tipo="MATCHING" />}

        {!analisisListo && !matching && (
          <p className="text-sm text-muted-foreground">Necesitas un análisis completado antes de poder matchear.</p>
        )}

        {analisisListo && !matching && !enEsteRun && (
          <p className="text-sm text-muted-foreground">Esta licitación todavía no tiene matching.</p>
        )}

        {matching?.estado === "FALLIDO" && (
          <p className="text-sm text-destructive">
            El último intento falló{matching.detalleError ? `: ${matching.detalleError}` : "."}
          </p>
        )}

        {matching?.estado === "COMPLETADO" && (
          <>
            <div className="flex items-center gap-2">
              {matching.recomendacion && <Badge>{ETIQUETAS_RECOMENDACION[matching.recomendacion]}</Badge>}
              {matching.puntaje !== null && (
                <span className="text-sm text-muted-foreground">Puntaje: {matching.puntaje}/100</span>
              )}
            </div>
            {matching.justificacion && <p className="text-sm">{matching.justificacion}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
