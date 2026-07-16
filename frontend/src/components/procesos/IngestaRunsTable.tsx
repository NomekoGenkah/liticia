import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarIngestaRuns } from "@/api/ingesta";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SimplePager } from "@/components/licitaciones/SimplePager";
import { formatFechaHora } from "@/lib/format";
import type { IngestaEstado } from "@/types/api";

const VARIANTE: Record<IngestaEstado, "default" | "secondary" | "destructive"> = {
  COMPLETADO: "default",
  EN_PROCESO: "secondary",
  FALLIDO: "destructive",
};

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
            <TableHead>Encontradas</TableHead>
            <TableHead>Nuevas</TableHead>
            <TableHead>Actualizadas</TableHead>
            <TableHead>Errores</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>{formatFechaHora(run.fechaInicio)}</TableCell>
              <TableCell>{run.disparadoPor}</TableCell>
              <TableCell>
                <Badge variant={VARIANTE[run.estado]}>{run.estado}</Badge>
              </TableCell>
              <TableCell>{run.totalEncontradas}</TableCell>
              <TableCell>{run.totalNuevas}</TableCell>
              <TableCell>{run.totalActualizadas}</TableCell>
              <TableCell>{run.totalErrores}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <SimplePager pagination={data.meta} onPageChange={setPage} />
    </div>
  );
}
