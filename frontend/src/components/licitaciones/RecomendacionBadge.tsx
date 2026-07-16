import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MatchingResumen } from "@/types/api";

const ESTILOS: Record<"SI" | "NO" | "TAL_VEZ", string> = {
  SI: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400",
  TAL_VEZ: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400",
  NO: "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-400",
};

const ETIQUETAS: Record<"SI" | "NO" | "TAL_VEZ", string> = {
  SI: "Sí",
  TAL_VEZ: "Tal vez",
  NO: "No",
};

export function RecomendacionBadge({ matching }: { matching: MatchingResumen | null }) {
  if (!matching || matching.estado === "FALLIDO") {
    return <Badge variant="outline">{matching?.estado === "FALLIDO" ? "Matching falló" : "Sin match"}</Badge>;
  }

  if (!matching.recomendacion) return <Badge variant="outline">Sin match</Badge>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge className={cn(ESTILOS[matching.recomendacion])}>{ETIQUETAS[matching.recomendacion]}</Badge>
      {matching.puntaje !== null && <span className="text-xs text-muted-foreground">{matching.puntaje}/100</span>}
    </span>
  );
}
