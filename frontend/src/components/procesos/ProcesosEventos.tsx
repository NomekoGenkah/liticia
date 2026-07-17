import { useProcesoEventosGlobales } from "@/hooks/useProcesoEventos";

/**
 * Abre la conexión de eventos de procesos. No renderiza nada: se monta una sola vez, arriba de
 * todo, para que haya exactamente un EventSource por pestaña.
 *
 * Un stream por panel serían tres conexiones permanentes, y el navegador solo admite 6 por origen
 * sobre HTTP/1.1: las queries normales empezarían a hacer cola detrás de streams que no terminan.
 */
export function ProcesosEventos() {
  useProcesoEventosGlobales();
  return null;
}
