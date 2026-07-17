import type { RunVivo } from "@/types/procesos";

/**
 * Cuánto falta, estimado a partir de lo que ya tardó.
 *
 * Hace falta al menos un ítem terminado: sin eso no hay ritmo que extrapolar, y un número inventado
 * en el primer segundo es peor que no mostrar nada. Devuelve null también cuando ya no queda nada.
 */
export function estimarRestante(run: RunVivo): number | null {
  const hechas = run.completadas + run.fallidas + run.omitidos;
  if (hechas === 0 || hechas >= run.total) return null;

  const transcurrido = Date.now() - new Date(run.fechaInicio).getTime();
  return (run.total - hechas) * (transcurrido / hechas);
}
