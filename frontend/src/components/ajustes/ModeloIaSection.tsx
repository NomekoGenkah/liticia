import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  descargarModelo,
  guardarConfigIa,
  listarModelos,
  obtenerConfigIa,
  obtenerHardware,
  type Fit,
  type GuardarConfigInput,
  type ModeloConEstado,
} from "@/api/configIa";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const FIT_INFO: Record<Fit, { label: string; clase: string }> = {
  holgado: { label: "Entra holgado", clase: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  justo: { label: "Entra justo", clase: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  no_entra: { label: "No entra en VRAM", clase: "border-red-500/40 text-red-600 dark:text-red-400" },
  desconocido: { label: "Sin presupuesto", clase: "border-border text-muted-foreground" },
};

function FitBadge({ fit }: { fit: Fit }) {
  const info = FIT_INFO[fit];
  return (
    <Badge variant="outline" className={cn("shrink-0", info.clase)}>
      {info.label}
    </Badge>
  );
}

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function ModeloIaSection() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: ["config-ia"], queryFn: obtenerConfigIa });
  const modelos = useQuery({ queryKey: ["config-ia", "modelos"], queryFn: listarModelos });
  const hardware = useQuery({ queryKey: ["config-ia", "hardware"], queryFn: obtenerHardware });

  const [vram, setVram] = useState("");
  const [ram, setRam] = useState("");
  const [descarga, setDescarga] = useState<{ model: string; pct: number; status: string } | null>(null);

  // Prellenar los inputs de presupuesto con lo guardado, o con lo autodetectado si no hay guardado.
  useEffect(() => {
    if (!config.data) return;
    setVram(String(config.data.vramBudgetMb ?? hardware.data?.vramMb ?? ""));
    setRam(String(config.data.ramBudgetMb ?? hardware.data?.ramLibreMb ?? ""));
  }, [config.data, hardware.data]);

  const guardarMutation = useMutation({
    mutationFn: guardarConfigIa,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-ia"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "No se pudo guardar la configuración"),
  });

  // El PUT reemplaza toda la config: cada guardado manda el estado completo para no pisar los otros
  // campos (cambiar el modelo no debe borrar el presupuesto, ni al revés).
  function guardar(cambios: GuardarConfigInput) {
    const base = config.data;
    guardarMutation.mutate({
      proveedor: base?.proveedor ?? "OLLAMA",
      modeloChat: base?.modeloChat ?? null,
      vramBudgetMb: base?.vramBudgetMb ?? null,
      ramBudgetMb: base?.ramBudgetMb ?? null,
      ...cambios,
    });
  }

  function seleccionar(nombre: string) {
    guardar({ modeloChat: nombre });
    toast.success(`Modelo activo: ${nombre}`);
  }

  function guardarPresupuesto() {
    const v = vram.trim() === "" ? null : Number.parseInt(vram, 10);
    const r = ram.trim() === "" ? null : Number.parseInt(ram, 10);
    if ((v !== null && !Number.isFinite(v)) || (r !== null && !Number.isFinite(r))) {
      toast.error("El presupuesto debe ser un número en MB");
      return;
    }
    guardar({ vramBudgetMb: v, ramBudgetMb: r });
    toast.success("Presupuesto guardado");
  }

  async function descargar(nombre: string) {
    setDescarga({ model: nombre, pct: 0, status: "Iniciando…" });
    try {
      await descargarModelo(nombre, (ev) => {
        const pct = ev.total && ev.completed ? Math.round((ev.completed / ev.total) * 100) : undefined;
        setDescarga((d) => (d ? { ...d, pct: pct ?? d.pct, status: ev.status ?? d.status } : d));
      });
      toast.success(`${nombre} descargado`);
      queryClient.invalidateQueries({ queryKey: ["config-ia", "modelos"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `No se pudo descargar ${nombre}`);
    } finally {
      setDescarga(null);
    }
  }

  const activo = modelos.data?.modeloChatActivo ?? config.data?.modeloChatActivo;
  const instalados = (modelos.data?.modelos ?? []).filter((m) => m.instalado);
  const disponibles = (modelos.data?.modelos ?? []).filter((m) => !m.instalado);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Modelo de chat</h3>
        <p className="text-xs text-muted-foreground">
          Usado para análisis, matching y las preguntas del RAG. El modelo de embeddings es fijo y no se
          cambia acá (está atado al índice vectorial).
        </p>

        {modelos.isError && (
          <p className="text-sm text-red-600 dark:text-red-400">
            No se pudo consultar Ollama. ¿Está corriendo y accesible desde el backend?
          </p>
        )}

        <div className="mt-1 flex flex-col gap-1">
          {instalados.map((m) => (
            <ModeloBoton key={m.nombre} m={m} activo={m.nombre === activo} onClick={() => seleccionar(m.nombre)} />
          ))}
          {modelos.isLoading && <p className="text-sm text-muted-foreground">Cargando modelos…</p>}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Presupuesto de hardware</h3>
        <p className="text-xs text-muted-foreground">
          {hardware.data?.gpuDetectada
            ? `Detectado: ${gb(hardware.data.vramMb ?? 0)} de VRAM (${hardware.data.vramNombre ?? "GPU"}). Editá si querés.`
            : "No se pudo detectar la GPU desde el backend. Configurá la VRAM a mano."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="vram-budget" className="text-xs">
              VRAM (MB)
            </Label>
            <Input id="vram-budget" inputMode="numeric" value={vram} onChange={(e) => setVram(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ram-budget" className="text-xs">
              RAM libre (MB)
            </Label>
            <Input id="ram-budget" inputMode="numeric" value={ram} onChange={(e) => setRam(e.target.value)} />
          </div>
        </div>
        <Button size="sm" variant="secondary" className="self-start" onClick={guardarPresupuesto}>
          Guardar presupuesto
        </Button>
      </section>

      {disponibles.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Catálogo</h3>
          <p className="text-xs text-muted-foreground">Modelos recomendados que podés descargar.</p>
          <div className="flex flex-col gap-2">
            {disponibles.map((m) => (
              <div key={m.nombre} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{m.nombre}</span>
                  <span className="text-xs text-muted-foreground">{gb(m.tamañoMb)}</span>
                  {m.recomendado && (
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      Recomendado
                    </Badge>
                  )}
                  <FitBadge fit={m.fit} />
                </div>
                <p className="text-xs text-muted-foreground">{m.blurb}</p>
                {descarga?.model === m.nombre ? (
                  <div className="flex flex-col gap-1">
                    <Progress value={descarga.pct} />
                    <span className="text-xs text-muted-foreground">
                      {descarga.status} · {descarga.pct}%
                    </span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="self-start"
                    disabled={descarga !== null}
                    onClick={() => descargar(m.nombre)}
                  >
                    {descarga !== null ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <DownloadIcon className="size-4" />
                    )}
                    Descargar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ModeloBoton({ m, activo, onClick }: { m: ModeloConEstado; activo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted",
        activo ? "border-foreground/40 bg-muted" : "border-transparent"
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm">
          {m.nombre}
          <span className="text-xs text-muted-foreground">{m.parametros}</span>
          {m.recomendado && (
            <Badge variant="outline" className="border-primary/40 text-primary">
              Recomendado
            </Badge>
          )}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <FitBadge fit={m.fit} />
        {activo && <CheckIcon className="size-4 shrink-0" />}
      </span>
    </button>
  );
}
