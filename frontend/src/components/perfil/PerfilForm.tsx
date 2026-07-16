import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagListInput } from "./TagListInput";
import { guardarPerfilEmpresa } from "@/api/perfilEmpresa";
import type { PerfilEmpresa, PerfilEmpresaInput } from "@/types/api";

const schema = z.object({
  tipo: z.enum(["EMPRESA", "PERSONA_NATURAL"]),
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().min(1, "La descripción es obligatoria"),
  rubro: z.string().optional(),
  palabrasClave: z.array(z.string()),
  categoriasUnspsc: z.array(z.string()),
  regionesInteres: z.array(z.string()),
  montoMinimo: z.string(),
  montoMaximo: z.string(),
});

type FormValues = z.infer<typeof schema>;

function toFormValues(perfil: PerfilEmpresa | null): FormValues {
  return {
    tipo: perfil?.tipo ?? "EMPRESA",
    nombre: perfil?.nombre ?? "",
    descripcion: perfil?.descripcion ?? "",
    rubro: perfil?.rubro ?? "",
    palabrasClave: perfil?.palabrasClave ?? [],
    categoriasUnspsc: perfil?.categoriasUnspsc ?? [],
    regionesInteres: perfil?.regionesInteres ?? [],
    montoMinimo: perfil?.montoMinimo ?? "",
    montoMaximo: perfil?.montoMaximo ?? "",
  };
}

function parseMonto(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const numero = Number(raw);
  return Number.isFinite(numero) ? numero : undefined;
}

export function PerfilForm({ perfil }: { perfil: PerfilEmpresa | null }) {
  const queryClient = useQueryClient();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(perfil),
  });

  const mutation = useMutation({
    mutationFn: (input: PerfilEmpresaInput) => guardarPerfilEmpresa(input),
    onSuccess: () => {
      toast.success("Perfil guardado. Los matchings calculados con la versión anterior quedarán pendientes.");
      queryClient.invalidateQueries({ queryKey: ["perfil-empresa"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo guardar el perfil"),
  });

  function onSubmit(values: FormValues) {
    mutation.mutate({
      tipo: values.tipo,
      nombre: values.nombre,
      descripcion: values.descripcion,
      rubro: values.rubro || undefined,
      palabrasClave: values.palabrasClave,
      categoriasUnspsc: values.categoriasUnspsc,
      regionesInteres: values.regionesInteres,
      montoMinimo: parseMonto(values.montoMinimo),
      montoMaximo: parseMonto(values.montoMaximo),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {!perfil && (
        <p className="rounded-md border border-amber-300/50 bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-400">
          Aún no configuras tu perfil de empresa — el matching contra licitaciones no funcionará hasta que lo guardes.
        </p>
      )}
      {perfil && <p className="text-xs text-muted-foreground">Versión actual del perfil: {perfil.version}</p>}

      <div className="flex flex-col gap-1.5">
        <Label>Tipo de perfil</Label>
        <Controller
          control={control}
          name="tipo"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMPRESA">Empresa</SelectItem>
                <SelectItem value="PERSONA_NATURAL">Persona natural</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="perfil-nombre">Nombre</Label>
        <Input id="perfil-nombre" {...register("nombre")} />
        {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="perfil-descripcion">Descripción — qué hace, qué le interesa postular</Label>
        <Textarea id="perfil-descripcion" rows={5} {...register("descripcion")} />
        {errors.descripcion && <p className="text-xs text-destructive">{errors.descripcion.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="perfil-rubro">Rubro</Label>
        <Input id="perfil-rubro" {...register("rubro")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Palabras clave</Label>
        <Controller
          control={control}
          name="palabrasClave"
          render={({ field }) => (
            <TagListInput value={field.value} onChange={field.onChange} placeholder="Agrega y presiona Enter" />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Categorías UNSPSC de interés</Label>
        <Controller
          control={control}
          name="categoriasUnspsc"
          render={({ field }) => (
            <TagListInput value={field.value} onChange={field.onChange} placeholder="Código UNSPSC, Enter para agregar" />
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Regiones de interés</Label>
        <Controller
          control={control}
          name="regionesInteres"
          render={({ field }) => (
            <TagListInput value={field.value} onChange={field.onChange} placeholder="Región, Enter para agregar" />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="perfil-monto-min">Monto mínimo</Label>
          <Input id="perfil-monto-min" type="number" min={0} {...register("montoMinimo")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="perfil-monto-max">Monto máximo</Label>
          <Input id="perfil-monto-max" type="number" min={0} {...register("montoMaximo")} />
        </div>
      </div>

      <Button type="submit" className="w-fit" disabled={mutation.isPending || (!isDirty && Boolean(perfil))}>
        {mutation.isPending ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}
