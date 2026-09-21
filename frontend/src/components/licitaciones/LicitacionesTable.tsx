import { useNavigate } from "react-router-dom";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles } from "lucide-react";
import { EstadoBadge } from "./EstadoBadge";
import { RecomendacionBadge } from "./RecomendacionBadge";
import { NivelComplejidadBadge } from "./NivelComplejidadBadge";
import { formatFecha, formatMonto } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LicitacionListItem } from "@/types/api";

interface Props {
  licitaciones: LicitacionListItem[];
  /** Ids seleccionados. Puede incluir licitaciones de otras páginas. */
  seleccion: Set<string>;
  onToggle: (id: string) => void;
  /** Tilda o destilda las de esta página. */
  onToggleTodas: (ids: string[], tildar: boolean) => void;
}

export function LicitacionesTable({ licitaciones, seleccion, onToggle, onToggleTodas }: Props) {
  const navigate = useNavigate();

  if (licitaciones.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No hay licitaciones para estos filtros.</p>;
  }

  const idsPagina = licitaciones.map((licitacion) => licitacion.id);
  const enPagina = idsPagina.filter((id) => seleccion.has(id)).length;
  const todas = enPagina === idsPagina.length;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-0">
            <Checkbox
              checked={todas}
              // Ni tildado ni vacío cuando hay algunas: un tilde lleno diría "todas" y sería falso.
              indeterminate={enPagina > 0 && !todas}
              onCheckedChange={() => onToggleTodas(idsPagina, !todas)}
              aria-label="Seleccionar todas las de esta página"
            />
          </TableHead>
          <TableHead>Licitación</TableHead>
          <TableHead>Organismo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Cierre</TableHead>
          <TableHead>Monto</TableHead>
          <TableHead>Análisis</TableHead>
          <TableHead>Matching</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {licitaciones.map((licitacion) => {
          const tildada = seleccion.has(licitacion.id);
          const esRecomendada = licitacion.matching?.recomendacion === "SI";

          return (
            <TableRow
              key={licitacion.id}
              data-state={tildada ? "selected" : undefined}
              className={cn(
                "cursor-pointer transition-colors",
                esRecomendada && "bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]"
              )}
              onClick={() => navigate(`/licitaciones/${licitacion.codigoExterno}`)}
            >
              {/* El stopPropagation va en la celda y no solo en el checkbox: hacer clic en el
                  padding de alrededor tampoco tiene que navegar al detalle. */}
              <TableCell className="w-0" onClick={(evento) => evento.stopPropagation()}>
                <Checkbox
                  checked={tildada}
                  onCheckedChange={() => onToggle(licitacion.id)}
                  aria-label={`Seleccionar ${licitacion.codigoExterno}`}
                />
              </TableCell>
              <TableCell className="max-w-80 truncate whitespace-normal">
                <div className="font-medium flex items-center gap-1.5">
                  {esRecomendada && (
                    <Sparkles className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span>{licitacion.nombre}</span>
                </div>
                <div className="text-xs text-muted-foreground">{licitacion.codigoExterno}</div>
              </TableCell>
              <TableCell className="max-w-52 truncate">{licitacion.nombreOrganismo ?? "—"}</TableCell>
              <TableCell>
                <EstadoBadge estado={licitacion.estado} />
              </TableCell>
              <TableCell>{formatFecha(licitacion.fechaCierre)}</TableCell>
              <TableCell>{formatMonto(licitacion.montoEstimado, licitacion.moneda)}</TableCell>
              <TableCell>
                <NivelComplejidadBadge analisis={licitacion.analisis} />
              </TableCell>
              <TableCell>
                <RecomendacionBadge matching={licitacion.matching} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
