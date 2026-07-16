import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { CheckIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useFuente } from "@/hooks/useFuente";
import { FUENTES } from "@/lib/fuentes";
import { cn } from "@/lib/utils";

const TEMAS = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

export function AjustesDialog() {
  const { theme, setTheme } = useTheme();
  const { fuente, cambiarFuente } = useFuente();
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="size-8" aria-label="Ajustes">
            <SettingsIcon className="size-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustes</DialogTitle>
          <DialogDescription>Se guardan en este navegador.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Tema</h3>
            <div className="grid grid-cols-3 gap-2">
              {TEMAS.map((opcion) => (
                <button
                  key={opcion.value}
                  type="button"
                  onClick={() => setTheme(opcion.value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted",
                    montado && theme === opcion.value
                      ? "border-foreground/40 bg-muted font-medium"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {opcion.label}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Fuente</h3>
            <div className="flex flex-col gap-1">
              {FUENTES.map((opcion) => {
                const activa = fuente === opcion.id;

                return (
                  <button
                    key={opcion.id}
                    type="button"
                    onClick={() => cambiarFuente(opcion.id)}
                    aria-pressed={activa}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted",
                      activa ? "border-foreground/40 bg-muted" : "border-transparent"
                    )}
                  >
                    <span className="flex flex-col gap-0.5">
                      {/* Cada opción se muestra en su propia fuente: se elige viendo, no leyendo. */}
                      <span className="text-sm" style={{ fontFamily: opcion.stack }}>
                        {opcion.nombre} — Licitación 1234-5-LE26
                      </span>
                      <span className="text-xs text-muted-foreground">{opcion.razon}</span>
                    </span>
                    {activa && <CheckIcon className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
