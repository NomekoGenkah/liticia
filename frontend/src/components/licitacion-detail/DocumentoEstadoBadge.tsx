import { Badge } from "@/components/ui/badge";
import type { DocumentoEstadoExtraccion } from "@/types/api";

const VARIANT_POR_ESTADO: Record<DocumentoEstadoExtraccion, "default" | "secondary" | "outline" | "destructive"> = {
  PENDIENTE: "secondary",
  COMPLETADO: "default",
  FALLIDO: "destructive",
};

const ETIQUETA_POR_ESTADO: Record<DocumentoEstadoExtraccion, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADO: "Extraído",
  FALLIDO: "Falló extracción",
};

export function DocumentoEstadoBadge({ estado }: { estado: DocumentoEstadoExtraccion }) {
  return <Badge variant={VARIANT_POR_ESTADO[estado]}>{ETIQUETA_POR_ESTADO[estado]}</Badge>;
}
