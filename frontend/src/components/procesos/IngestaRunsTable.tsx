import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarIngestaRuns } from "@/api/ingesta";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimplePager } from "@/components/licitaciones/SimplePager";
import { formatDuracion, formatFechaHora } from "@/lib/format";
import type { IngestaEstado, IngestaRun } from "@/types/api";

const VARIANTE: Record<IngestaEstado, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETADO: "default",
  EN_PROCESO: "secondary",
  FALLIDO: "destructive",
  INTERRUMPIDO: "outline",
};

const INGESTAS = { singular: "ingesta", plural: "ingestas" };

/** Los filtros con los que se disparó, ya legibles. Sin filtros, la ingesta trae el día de hoy. */
function describirParametros(parametros: unknown): string {
  if (!parametros || typeof parametros !== "object") return "—";

  const entradas = Object.entries(parametros as Record<string, unknown>).filter(
    ([, valor]) => valor !== undefined && valor !== null && valor !== ""
  );

  if (entradas.length === 0) return "sin filtros";
  return entradas.map(([clave, valor]) => `${clave}: ${String(valor)}`).join(" · ");
}

function duracionDe(run: IngestaRun): string {
  if (!run.fechaFin) return "—";
  return formatDuracion(new Date(run.fechaFin).getTime() - new Date(run.fechaInicio).getTime());
}

export function IngestaRunsTable() {
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ["ingesta-runs", page],
    queryFn: () => listarIngestaRuns(page, 10),
    placeholderData: (prev) => prev,
  });

  if (!data || data.runs.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no se ha ejecutado ninguna ingesta.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Inicio</TableHead>
            <TableHead>Disparado por</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Duración</TableHead>
            <TableHead>Encontradas</TableHead>
            <TableHead>Nuevas</TableHead>
            <TableHead>Actualizadas</TableHead>
            <TableHead>Errores</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <div className="flex flex-col">
                  {formatFechaHora(run.fechaInicio)}
                  <span className="text-xs text-muted-foreground">{describirParametros(run.parametros)}</span>
                </div>
              </TableCell>
              <TableCell>{run.disparadoPor}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Badge variant={VARIANTE[run.estado]} className="w-fit">
                    {run.estado}
                  </Badge>
                  {run.detalleError && (
                    <span className="max-w-64 text-xs text-destructive">{run.detalleError}</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="tabular-nums">{duracionDe(run)}</TableCell>
              <TableCell className="tabular-nums">{run.totalEncontradas}</TableCell>
              <TableCell className="tabular-nums">{run.totalNuevas}</TableCell>
              <TableCell className="tabular-nums">{run.totalActualizadas}</TableCell>
              <TableCell className="tabular-nums">{run.totalErrores}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <SimplePager pagination={data.meta} onPageChange={setPage} entidad={INGESTAS} />
    </div>
  );
}
