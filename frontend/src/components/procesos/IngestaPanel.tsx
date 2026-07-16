import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ejecutarIngesta, obtenerEstadoIngesta } from "@/api/ingesta";
import { ApiError } from "@/api/client";
import { useProcesoPolling } from "@/hooks/useProcesoPolling";
import { ESTADOS_FILTRO_INGESTA, type EstadoFiltroIngesta } from "@/types/api";

const SIN_FILTRO = "__todos__";

export function IngestaPanel() {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState("");
  const [estado, setEstado] = useState<EstadoFiltroIngesta | undefined>(undefined);
  const [codigoOrganismo, setCodigoOrganismo] = useState("");
  const [codigoProveedor, setCodigoProveedor] = useState("");

  const { enProceso } = useProcesoPolling(["ingesta-estado"], obtenerEstadoIngesta);

  const mutation = useMutation({
    mutationFn: () =>
      ejecutarIngesta({
        fecha: fecha || undefined,
        estado,
        codigoOrganismo: codigoOrganismo || undefined,
        codigoProveedor: codigoProveedor || undefined,
      }),
    onSuccess: (resumen) => {
      toast.success(
        `Ingesta completada: ${resumen.totalNuevas} nuevas, ${resumen.totalActualizadas} actualizadas de ${resumen.totalEncontradas} encontradas.`
      );
      queryClient.invalidateQueries({ queryKey: ["ingesta-runs"] });
      queryClient.invalidateQueries({ queryKey: ["licitaciones"] });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "INGESTA_EN_PROCESO") {
        toast.error("Ya hay una ingesta en curso.");
      } else {
        toast.error(err instanceof Error ? err.message : "La ingesta falló");
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingesta de licitaciones</CardTitle>
        <CardDescription>Trae licitaciones nuevas o actualizadas desde ChileCompra. Filtros opcionales.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ingesta-fecha">Fecha</Label>
            <Input id="ingesta-fecha" type="date" className="w-40" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ingesta-estado">Estado</Label>
            <Select
              value={estado ?? SIN_FILTRO}
              onValueChange={(v) => setEstado(!v || v === SIN_FILTRO ? undefined : (v as EstadoFiltroIngesta))}
            >
              <SelectTrigger id="ingesta-estado" className="w-40">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_FILTRO}>Todos</SelectItem>
                {ESTADOS_FILTRO_INGESTA.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ingesta-organismo">Código organismo</Label>
            <Input
              id="ingesta-organismo"
              className="w-36"
              value={codigoOrganismo}
              onChange={(e) => setCodigoOrganismo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ingesta-proveedor">Código proveedor</Label>
            <Input
              id="ingesta-proveedor"
              className="w-36"
              value={codigoProveedor}
              onChange={(e) => setCodigoProveedor(e.target.value)}
            />
          </div>
        </div>

        <Button className="w-fit" disabled={enProceso || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Ejecutando…" : "Ejecutar ingesta ahora"}
        </Button>
      </CardContent>
    </Card>
  );
}
