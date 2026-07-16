import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/api/client";
import { Button } from "@/components/ui/button";
import type { LicitacionDetalle } from "@/types/api";

export function RawJsonViewer({ codigoExterno }: { codigoExterno: string }) {
  const [abierto, setAbierto] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["licitacion-raw", codigoExterno],
    queryFn: () => apiRequest<LicitacionDetalle>(`/licitaciones/${codigoExterno}`, { searchParams: { raw: "true" } }),
    enabled: abierto,
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Ocultar JSON crudo" : "Ver JSON crudo (ChileCompra)"}
      </Button>
      {abierto && (
        <pre className="max-h-96 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
          {isLoading ? "Cargando…" : JSON.stringify(data?.rawResponse, null, 2)}
        </pre>
      )}
    </div>
  );
}
