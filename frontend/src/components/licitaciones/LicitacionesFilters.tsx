import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ESTADOS_LICITACION } from "@/types/api";
import type { ListarLicitacionesParams } from "@/api/licitaciones";

const ORDEN_OPCIONES = [
  { value: "fechaPublicacion:desc", label: "Publicación (recientes primero)" },
  { value: "fechaPublicacion:asc", label: "Publicación (antiguas primero)" },
  { value: "fechaCierre:asc", label: "Cierre (más próximo primero)" },
  { value: "fechaCierre:desc", label: "Cierre (más lejano primero)" },
  { value: "montoEstimado:desc", label: "Monto (mayor a menor)" },
  { value: "montoEstimado:asc", label: "Monto (menor a mayor)" },
  { value: "puntaje:desc", label: "Puntaje matching (mayor a menor)" },
  { value: "puntaje:asc", label: "Puntaje matching (menor a mayor)" },
];

const SIN_FILTRO = "__todos__";

// Base UI necesita `items` en Select.Root para que Select.Value muestre la etiqueta del ítem
// elegido; sin esto renderiza el value crudo ("__todos__", "fechaPublicacion:asc").
const ESTADO_ITEMS = [
  { value: SIN_FILTRO, label: "Todos" },
  ...ESTADOS_LICITACION.map((estado) => ({ value: estado, label: estado })),
];

const RECOMENDACION_ITEMS = [
  { value: SIN_FILTRO, label: "Todas" },
  { value: "SI", label: "Sí" },
  { value: "TAL_VEZ", label: "Tal vez" },
  { value: "NO", label: "No" },
];

export interface LicitacionesFiltrosState {
  estado?: string;
  codigoOrganismo?: string;
  recomendacion?: "SI" | "NO" | "TAL_VEZ";
  orderBy: string;
}

interface Props {
  value: LicitacionesFiltrosState;
  onApply: (filtros: ListarLicitacionesParams) => void;
}

export function LicitacionesFilters({ value, onApply }: Props) {
  const [local, setLocal] = useState(value);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onApply(local);
  }

  function handleLimpiar() {
    const limpio: LicitacionesFiltrosState = { orderBy: "fechaPublicacion:desc" };
    setLocal(limpio);
    onApply(limpio);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-estado">Estado</Label>
        <Select
          items={ESTADO_ITEMS}
          value={local.estado ?? SIN_FILTRO}
          onValueChange={(v) =>
            setLocal((prev) => ({ ...prev, estado: !v || v === SIN_FILTRO ? undefined : String(v) }))
          }
        >
          <SelectTrigger id="filtro-estado" className="w-40">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            {ESTADO_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-organismo">Código organismo</Label>
        <Input
          id="filtro-organismo"
          className="w-40"
          placeholder="Ej. 6945"
          value={local.codigoOrganismo ?? ""}
          onChange={(e) => setLocal((prev) => ({ ...prev, codigoOrganismo: e.target.value || undefined }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-recomendacion">Recomendación IA</Label>
        <Select
          items={RECOMENDACION_ITEMS}
          value={local.recomendacion ?? SIN_FILTRO}
          onValueChange={(v) =>
            setLocal((prev) => ({
              ...prev,
              recomendacion: !v || v === SIN_FILTRO ? undefined : (v as "SI" | "NO" | "TAL_VEZ"),
            }))
          }
        >
          <SelectTrigger id="filtro-recomendacion" className="w-36">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            {RECOMENDACION_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="filtro-orden">Ordenar por</Label>
        <Select
          items={ORDEN_OPCIONES}
          value={local.orderBy}
          onValueChange={(v) => v && setLocal((prev) => ({ ...prev, orderBy: String(v) }))}
        >
          <SelectTrigger id="filtro-orden" className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDEN_OPCIONES.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="submit">Filtrar</Button>
        <Button type="button" variant="ghost" onClick={handleLimpiar}>
          Limpiar
        </Button>
      </div>
    </form>
  );
}
