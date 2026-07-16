import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LicitacionItem } from "@/types/api";

export function ItemsTable({ items }: { items: LicitacionItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta licitación no tiene ítems informados.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead>Categoría UNSPSC</TableHead>
          <TableHead>Cantidad</TableHead>
          <TableHead>Unidad</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-normal">{item.nombreProducto}</TableCell>
            <TableCell>{item.categoriaUnspsc ?? "—"}</TableCell>
            <TableCell>{item.cantidad ?? "—"}</TableCell>
            <TableCell>{item.unidadMedida ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
