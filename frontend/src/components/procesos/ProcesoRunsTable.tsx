import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { listarProcesoRuns } from "@/api/procesos";
import { SimplePager } from "@/components/licitaciones/SimplePager";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDuracion, formatFechaHora } from "@/lib/format";
import type { ProcesoRunEstado, ProcesoTipo } from "@/types/procesos";
import { ProcesoRunItems } from "./ProcesoRunItems";

const VARIANTE: Record<ProcesoRunEstado, "default" | "secondary" | "destructive" | "outline"> = {
  COMPLETADO: "default",
  EN_PROCESO: "secondary",
  FALLIDO: "destructive",
  CANCELADO: "outline",
  INTERRUMPIDO: "outline",
};

const ETIQUETA_TIPO: Record<ProcesoTipo, string> = {
  ANALISIS: "Análisis",
  MATCHING: "Matching",
  EMBEDDING: "Embeddings",
};

const RUNS = { singular: "corrida", plural: "corridas" };

/** Historial de las corridas de IA. El equivalente al de ingestas, que existía desde la Fase 2. */
export function ProcesoRunsTable() {
  const [page, setPage] = useState(1);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["proceso-runs", page],
    queryFn: () => listarProcesoRuns(page, 10),
    placeholderData: (previo) => previo,
  });

  if (!data || data.runs.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no se ha ejecutado ningún proceso de IA.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0" />
            <TableHead>Inicio</TableHead>
            <TableHead>Proceso</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Duración</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Completadas</TableHead>
            <TableHead>Fallidas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.runs.map((run) => {
            const abierto = expandido === run.id;
            const duracion = run.fechaFin
              ? new Date(run.fechaFin).getTime() - new Date(run.fechaInicio).getTime()
              : null;

            return [
              <TableRow
                key={run.id}
                className="cursor-pointer"
                onClick={() => setExpandido(abierto ? null : run.id)}
                aria-expanded={abierto}
              >
                <TableCell>
                  <ChevronRight className={`size-4 transition-transform ${abierto ? "rotate-90" : ""}`} />
                </TableCell>
                <TableCell>{formatFechaHora(run.fechaInicio)}</TableCell>
                <TableCell>
                  {ETIQUETA_TIPO[run.tipo]}
                  {run.disparadoPor === "CLI" && <span className="ml-1 text-xs text-muted-foreground">(CLI)</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={VARIANTE[run.estado]}>{run.estado}</Badge>
                </TableCell>
                <TableCell className="tabular-nums">{duracion === null ? "—" : formatDuracion(duracion)}</TableCell>
                <TableCell className="tabular-nums">{run.totalEncontradas}</TableCell>
                <TableCell className="tabular-nums">{run.totalCompletadas}</TableCell>
                <TableCell className="tabular-nums">{run.totalFallidas}</TableCell>
              </TableRow>,

              // Los ítems se piden recién al expandir: son cientos por run y casi nunca se miran.
              abierto && (
                <TableRow key={`${run.id}-detalle`}>
                  <TableCell colSpan={8} className="bg-muted/30">
                    <div className="flex flex-col gap-2">
                      {run.detalleError && <p className="text-xs text-destructive">{run.detalleError}</p>}
                      <ProcesoRunItems runId={run.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ),
            ];
          })}
        </TableBody>
      </Table>
      <SimplePager pagination={data.meta} onPageChange={setPage} entidad={RUNS} />
    </div>
  );
}
