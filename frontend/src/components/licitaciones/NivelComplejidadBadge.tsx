import { Badge } from "@/components/ui/badge";
import type { AnalisisResumen } from "@/types/api";

const ETIQUETAS: Record<"BAJA" | "MEDIA" | "ALTA", string> = {
  BAJA: "Complejidad baja",
  MEDIA: "Complejidad media",
  ALTA: "Complejidad alta",
};

export function NivelComplejidadBadge({ analisis }: { analisis: AnalisisResumen | null }) {
  if (!analisis) return <Badge variant="outline">Sin analizar</Badge>;
  if (analisis.estado === "FALLIDO") return <Badge variant="destructive">Análisis falló</Badge>;
  if (!analisis.nivelComplejidad) return <Badge variant="outline">Analizada</Badge>;
  return <Badge variant="secondary">{ETIQUETAS[analisis.nivelComplejidad]}</Badge>;
}
