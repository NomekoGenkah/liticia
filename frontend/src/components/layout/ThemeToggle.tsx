import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = useState(false);

  // El tema real se conoce recién en el cliente: hasta entonces se reserva el espacio del botón
  // para que el header no salte.
  useEffect(() => setMontado(true), []);

  if (!montado) return <div className="size-8" aria-hidden />;

  const esOscuro = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={esOscuro ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      onClick={() => setTheme(esOscuro ? "light" : "dark")}
    >
      {esOscuro ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}
