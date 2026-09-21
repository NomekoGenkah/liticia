import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { MatchingResumen } from "@/types/api";

const CONFIG: Record<
  "SI" | "NO" | "TAL_VEZ",
  {
    badgeClass: string;
    pillClass: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  SI: {
    badgeClass: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-semibold gap-1",
    pillClass: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 font-bold",
    label: "Sí",
    Icon: CheckCircle2,
  },
  TAL_VEZ: {
    badgeClass: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold gap-1",
    pillClass: "bg-amber-500/15 text-amber-800 dark:text-amber-300 font-medium",
    label: "Tal vez",
    Icon: HelpCircle,
  },
  NO: {
    badgeClass: "border-transparent bg-rose-500/10 text-rose-700 dark:text-rose-400 gap-1",
    pillClass: "text-muted-foreground",
    label: "No",
    Icon: XCircle,
  },
};

export function RecomendacionBadge({ matching }: { matching: MatchingResumen | null }) {
  if (!matching || matching.estado === "FALLIDO") {
    return (
      <Badge variant="outline" className="text-muted-foreground font-normal text-xs">
        {matching?.estado === "FALLIDO" ? "Falló" : "Sin match"}
      </Badge>
    );
  }

  if (!matching.recomendacion) {
    return <Badge variant="outline" className="text-muted-foreground font-normal text-xs">Sin match</Badge>;
  }

  const { badgeClass, pillClass, label, Icon } = CONFIG[matching.recomendacion];

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Badge className={cn("px-2 py-0.5 text-xs inline-flex items-center", badgeClass)}>
        <Icon className="size-3 shrink-0" />
        <span>{label}</span>
      </Badge>
      {matching.puntaje !== null && (
        <span className={cn("rounded px-1.5 py-0.5 text-xs tabular-nums", pillClass)}>
          {matching.puntaje}/100
        </span>
      )}
    </span>
  );
}
