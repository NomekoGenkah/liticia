import { useQuery } from "@tanstack/react-query";
import { obtenerPerfilEmpresa } from "@/api/perfilEmpresa";
import { PerfilForm } from "@/components/perfil/PerfilForm";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/api/client";

export function PerfilEmpresaPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["perfil-empresa"],
    queryFn: obtenerPerfilEmpresa,
    retry: (failureCount, err) => !(err instanceof ApiError && err.status === 404) && failureCount < 2,
  });

  const noConfigurado = error instanceof ApiError && error.status === 404;

  if (isLoading) {
    return (
      <div className="max-w-xl">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError && !noConfigurado) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        No se pudo cargar el perfil de empresa.
      </p>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Perfil de empresa</h1>
      <PerfilForm perfil={noConfigurado ? null : (data ?? null)} />
    </div>
  );
}
