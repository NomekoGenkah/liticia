import { useCallback, useEffect, useState } from "react";
import { aplicarFuente, CLAVE_FUENTE, FUENTE_POR_DEFECTO } from "@/lib/fuentes";

/**
 * Preferencia de fuente, guardada en el navegador. No va a la base de datos: es una preferencia
 * de esta máquina, no un dato del negocio.
 */
export function useFuente() {
  const [fuente, setFuente] = useState<string>(
    () => localStorage.getItem(CLAVE_FUENTE) ?? FUENTE_POR_DEFECTO
  );

  useEffect(() => {
    aplicarFuente(fuente);
  }, [fuente]);

  const cambiarFuente = useCallback((id: string) => {
    localStorage.setItem(CLAVE_FUENTE, id);
    setFuente(id);
  }, []);

  return { fuente, cambiarFuente };
}
