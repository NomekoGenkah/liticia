import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EstadoBadge } from "./EstadoBadge";
import { RecomendacionBadge } from "./RecomendacionBadge";
import { NivelComplejidadBadge } from "./NivelComplejidadBadge";
import { formatFecha, formatMonto } from "@/lib/format";
import type { LicitacionListItem } from "@/types/api";

export function LicitacionesTable({ licitaciones }: { licitaciones: LicitacionListItem[] }) {
  const navigate = useNavigate();

  if (licitaciones.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No hay licitaciones para estos filtros.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
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
        {licitaciones.map((licitacion) => (
          <TableRow
            key={licitacion.id}
            className="cursor-pointer"
            onClick={() => navigate(`/licitaciones/${licitacion.codigoExterno}`)}
          >
            <TableCell className="max-w-80 truncate whitespace-normal">
              <div className="font-medium">{licitacion.nombre}</div>
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
        ))}
      </TableBody>
    </Table>
  );
}
