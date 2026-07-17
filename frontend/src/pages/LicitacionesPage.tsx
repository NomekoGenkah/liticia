import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listarLicitaciones, type ListarLicitacionesParams } from "@/api/licitaciones";
import { LicitacionesFilters, type LicitacionesFiltrosState } from "@/components/licitaciones/LicitacionesFilters";
import { LicitacionesTable } from "@/components/licitaciones/LicitacionesTable";
import { SeleccionBar } from "@/components/licitaciones/SeleccionBar";
import { SimplePager } from "@/components/licitaciones/SimplePager";
import { Skeleton } from "@/components/ui/skeleton";
import { leerFiltros, ORDEN_POR_DEFECTO } from "@/lib/licitacionesFiltros";

const PAGE_SIZE = 20;

export function LicitacionesPage() {
  /**
   * Los filtros viven en la URL, no en estado local.
   *
   * No es un lujo: el panel de inicio linkea a `/licitaciones?orderBy=fechaCierre:asc` ("las que
   * cierran primero"), y con los filtros en useState ese link no hacía nada. De paso, el botón
   * "atrás" y compartir una búsqueda pasan a funcionar.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const filtros = leerFiltros(searchParams);
  const page = Number(searchParams.get("page")) || 1;

  /**
   * La selección sí es estado local: es efímera, puede tener cientos de ids y no tiene sentido
   * compartirla por link ni dejarla en el historial del navegador.
   *
   * Son ids y no codigoExterno porque es lo que espera el endpoint de procesos.
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

  /** Escribe en la URL solo lo que no es el default: `?page=1&orderBy=<el de siempre>` es ruido. */
  function escribirUrl(filtros: LicitacionesFiltrosState, pagina: number) {
    const nuevos = new URLSearchParams();

    if (filtros.estado) nuevos.set("estado", filtros.estado);
    if (filtros.codigoOrganismo) nuevos.set("codigoOrganismo", filtros.codigoOrganismo);
    if (filtros.recomendacion) nuevos.set("recomendacion", filtros.recomendacion);
    if (filtros.orderBy !== ORDEN_POR_DEFECTO) nuevos.set("orderBy", filtros.orderBy);
    if (pagina > 1) nuevos.set("page", String(pagina));

    setSearchParams(nuevos);
  }

  function handleApply(nuevos: ListarLicitacionesParams) {
    // Cambiar el filtro vuelve a la página 1: quedarse en la 3 de un resultado que ahora tiene una
    // sola página deja la tabla vacía sin explicación.
    escribirUrl(nuevos as LicitacionesFiltrosState, 1);
  }

  const irAPagina = (pagina: number) => escribirUrl(filtros, pagina);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Licitaciones</h1>

      {/* El key remonta el formulario cuando la URL cambia por fuera (botón "atrás", o el link del
          panel): su estado interno arranca de `value` y no lo vuelve a mirar, así que sin esto
          mostraría los filtros viejos mientras la tabla ya muestra los nuevos. */}
      <LicitacionesFilters key={searchParams.toString()} value={filtros} onApply={handleApply} />

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
          <SimplePager pagination={data.pagination} onPageChange={irAPagina} />
          <SeleccionBar seleccion={seleccion} onLimpiar={limpiar} />
        </>
      )}
    </div>
  );
}
