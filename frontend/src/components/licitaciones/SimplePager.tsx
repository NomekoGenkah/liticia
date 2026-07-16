import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/types/api";

export function SimplePager({ pagination, onPageChange }: { pagination: PaginationMeta; onPageChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {pagination.total} licitacion{pagination.total === 1 ? "" : "es"} · página {pagination.page} de {pagination.totalPages}
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
