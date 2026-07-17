import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listarLicitaciones, type ListarLicitacionesParams } from "@/api/licitaciones";
import { LicitacionesFilters, type LicitacionesFiltrosState } from "@/components/licitaciones/LicitacionesFilters";
import { LicitacionesTable } from "@/components/licitaciones/LicitacionesTable";
import { SeleccionBar } from "@/components/licitaciones/SeleccionBar";
import { SimplePager } from "@/components/licitaciones/SimplePager";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 20;

export function LicitacionesPage() {
  const [page, setPage] = useState(1);
  const [filtros, setFiltros] = useState<LicitacionesFiltrosState>({ orderBy: "fechaPublicacion:desc" });

  /**
   * Ids, no codigoExterno: es lo que espera el endpoint de procesos.
   *
   * En estado local y no en la URL: es efímera, puede tener cientos de ids, y los filtros de esta
   * página tampoco están en la URL — poner solo la selección sería incoherente.
   */
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const params: ListarLicitacionesParams = { page, pageSize: PAGE_SIZE, ...filtros };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["licitaciones", params],
    queryFn: () => listarLicitaciones(params),
    placeholderData: (prev) => prev,
  });

  const alternar = useCallback((id: string) => {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }, []);

  // No se limpia al cambiar de página: se puede ir juntando una selección entre páginas.
  const alternarTodas = useCallback((ids: string[], tildar: boolean) => {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      for (const id of ids) {
        if (tildar) siguiente.add(id);
        else siguiente.delete(id);
      }
      return siguiente;
    });
  }, []);

  const limpiar = useCallback(() => setSeleccion(new Set()), []);

  function handleApply(nuevos: ListarLicitacionesParams) {
    setFiltros(nuevos as LicitacionesFiltrosState);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Licitaciones</h1>

      <LicitacionesFilters value={filtros} onApply={handleApply} />

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudo cargar el listado: {error instanceof Error ? error.message : "error desconocido"}
        </p>
      )}

      {data && (
        <>
          <LicitacionesTable
            licitaciones={data.data}
            seleccion={seleccion}
            onToggle={alternar}
            onToggleTodas={alternarTodas}
          />
          <SimplePager pagination={data.pagination} onPageChange={setPage} />
          <SeleccionBar seleccion={seleccion} onLimpiar={limpiar} />
        </>
      )}
    </div>
  );
}
