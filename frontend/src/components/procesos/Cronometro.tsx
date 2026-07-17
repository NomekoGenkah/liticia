import { useEffect, useState } from "react";
import { formatDuracion } from "@/lib/format";

/**
 * Cuánto lleva corriendo algo, actualizado cada segundo.
 *
 * Componente aparte y no un contador dentro del panel: el tick de cada segundo re-renderiza solo
 * este texto, no la barra, los contadores ni el visor de tokens.
 */
export function Cronometro({ desde }: { desde: string }) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [desde]);

  return <span className="tabular-nums">{formatDuracion(ahora - new Date(desde).getTime())}</span>;
}
