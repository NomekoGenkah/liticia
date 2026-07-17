import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/types/api";

interface Props {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  /** Qué se está paginando, en singular y plural. Por defecto, licitaciones. */
  entidad?: { singular: string; plural: string };
}

const LICITACIONES = { singular: "licitación", plural: "licitaciones" };

export function SimplePager({ pagination, onPageChange, entidad = LICITACIONES }: Props) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {pagination.total} {pagination.total === 1 ? entidad.singular : entidad.plural} · página {pagination.page} de{" "}
        {pagination.totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => onPageChange(pagination.page - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
