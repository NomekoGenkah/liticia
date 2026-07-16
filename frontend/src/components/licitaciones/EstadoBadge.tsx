import { Badge } from "@/components/ui/badge";

const VARIANT_POR_ESTADO: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  Publicada: "default",
  Cerrada: "secondary",
  Adjudicada: "default",
  Desierta: "outline",
  Revocada: "destructive",
  Suspendida: "outline",
};

export function EstadoBadge({ estado }: { estado: string }) {
  return <Badge variant={VARIANT_POR_ESTADO[estado] ?? "outline"}>{estado}</Badge>;
}
