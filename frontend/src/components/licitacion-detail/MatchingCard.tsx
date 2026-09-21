import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  HelpCircle,
  XCircle,
  Sparkles,
  Zap,
  AlertTriangle,
  RotateCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { generarMatching } from "@/api/licitaciones";
import { ApiError } from "@/api/client";
import { ProcesoPanelVivo } from "@/components/procesos/ProcesoPanelVivo";
import { keyEstadoProceso, useProcesoEstado } from "@/hooks/useProcesoEventos";
import type { LicitacionAnalisis, LicitacionMatching } from "@/types/api";
import { cn } from "@/lib/utils";

const ERRORES: Record<string, string> = {
  PROCESO_EN_PROCESO: "Ya hay un matching en curso, espera a que termine.",
  ANALISIS_REQUERIDO: "Primero hay que generar el análisis de esta licitación.",
  PERFIL_EMPRESA_REQUERIDO: "Configura tu perfil de empresa antes de matchear.",
};

const RECOMENDACION_CONFIG = {
  SI: {
    label: "Sí, postular",
    sublabel: "Excelente calce con tu perfil tecnológico",
    icon: CheckCircle2,
    badgeClass: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    scoreText: "text-emerald-600 dark:text-emerald-400",
    scoreBg: "bg-emerald-500",
    lightBg: "bg-emerald-500/10",
  },
  TAL_VEZ: {
    label: "Tal vez",
    sublabel: "Calce parcial: requiere evaluar bases o alcance",
    icon: HelpCircle,
    badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400",
    scoreText: "text-amber-600 dark:text-amber-400",
    scoreBg: "bg-amber-500",
    lightBg: "bg-amber-500/10",
  },
  NO: {
    label: "No recomendado",
    sublabel: "Baja afinidad o fuera de tu rubro/territorio",
    icon: XCircle,
    badgeClass: "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-400",
    scoreText: "text-rose-600 dark:text-rose-400",
    scoreBg: "bg-rose-500",
    lightBg: "bg-rose-500/10",
  },
} as const;

export function MatchingCard({
  licitacionId,
  codigoExterno,
  matching,
}: {
  licitacionId: string;
  codigoExterno: string;
  matching: LicitacionMatching | null;
  analisis?: LicitacionAnalisis | null;
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

  const enEsteRun = Boolean(estado?.enProceso && estado.run?.objetoIds.includes(licitacionId));

  const motivoDeshabilitado =
    estado?.enProceso && !enEsteRun ? "Hay otro matching corriendo: espera a que termine" : undefined;

  const recConfig = matching?.recomendacion ? RECOMENDACION_CONFIG[matching.recomendacion] : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <CardTitle>Matching con tu perfil</CardTitle>
            {matching?.modelo && (
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground gap-1">
                <Zap className="size-2.5 text-amber-500" />
                {matching.modelo}
              </Badge>
            )}
          </div>
          <CardAction>
            <Button
              size="sm"
              variant={matching?.estado === "COMPLETADO" ? "outline" : "default"}
              disabled={estado?.enProceso || mutation.isPending}
              onClick={() => mutation.mutate()}
              title={motivoDeshabilitado}
              className="gap-1.5"
            >
              <RotateCw className={cn("size-3.5", mutation.isPending && "animate-spin")} />
              {matching?.estado === "COMPLETADO"
                ? "Regenerar"
                : matching
                ? "Reintentar"
                : "Evaluar con IA"}
            </Button>
          </CardAction>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {enEsteRun && <ProcesoPanelVivo tipo="MATCHING" />}

        {!matching && !enEsteRun && (
          <div className="flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed gap-3 bg-muted/20">
            <div className="p-3 rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-foreground">Aún no evaluada con tu perfil</p>
              <p className="text-xs text-muted-foreground">
                Califica directamente requisitos, ítems, presupuesto y ubicación con el modelo de IA.
              </p>
            </div>
            <Button
              size="sm"
              className="gap-2 mt-1"
              disabled={estado?.enProceso || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Sparkles className="size-3.5" />
              {mutation.isPending ? "Evaluando..." : "Calificar licitación"}
            </Button>
          </div>
        )}

        {matching?.estado === "FALLIDO" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive flex items-start gap-2.5">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-xs uppercase tracking-wide">Evaluación fallida</p>
              <p className="text-xs mt-1 opacity-90">{matching.detalleError ?? "Error desconocido en el proveedor LLM."}</p>
            </div>
          </div>
        )}

        {matching?.estado === "COMPLETADO" && recConfig && (
          <>
            {/* Banner de Calificación Principal */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border bg-card/60 shadow-xs">
              <div className="flex items-center gap-3">
                <div className={cn("p-2.5 rounded-full", recConfig.lightBg)}>
                  <recConfig.icon className={cn("size-6", recConfig.scoreText)} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">{recConfig.label}</span>
                    <Badge variant="outline" className={cn("text-xs font-semibold px-2 py-0.5", recConfig.badgeClass)}>
                      {matching.recomendacion}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{recConfig.sublabel}</p>
                </div>
              </div>

              {matching.puntaje !== null && (
                <div className="flex flex-col items-end">
                  <div className="flex items-baseline gap-1">
                    <span className={cn("text-3xl font-extrabold tabular-nums tracking-tight", recConfig.scoreText)}>
                      {matching.puntaje}
                    </span>
                    <span className="text-xs text-muted-foreground font-semibold">/ 100</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                    Afinidad Global
                  </span>
                </div>
              )}
            </div>

            {/* Barra de progreso de puntaje */}
            {matching.puntaje !== null && (
              <div className="space-y-1">
                <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700 ease-out", recConfig.scoreBg)}
                    style={{ width: `${Math.min(Math.max(matching.puntaje, 0), 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Dictamen / Justificación de la IA */}
            {matching.justificacion && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-sm leading-relaxed">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="size-4 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1 w-full">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                        Dictamen de la IA
                      </span>
                    </div>
                    <p className="text-foreground/90 text-sm">{matching.justificacion}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Footer de Metadata */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t pt-2.5 mt-1">
              <span className="inline-flex items-center gap-1">
                Evaluación: <strong className="font-medium text-foreground">Directa (ChileCompra)</strong>
              </span>
              <div className="flex items-center gap-3">
                {matching.duracionMs && (
                  <span>Latencia: <strong className="font-medium text-foreground">{matching.duracionMs} ms</strong></span>
                )}
                <span>Perfil: <strong className="font-medium text-foreground">v{matching.perfilVersion}</strong></span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
