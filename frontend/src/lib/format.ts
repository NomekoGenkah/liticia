export function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(iso));
}

export function formatFechaHora(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatMonto(monto: string | null, moneda: string | null): string {
  if (monto === null) return "No informado";
  const numero = Number(monto);
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda ?? "CLP" }).format(numero);
  } catch {
    return new Intl.NumberFormat("es-CL").format(numero) + (moneda ? ` ${moneda}` : "");
  }
}

/**
 * Duración legible a partir de milisegundos: "8s", "2m 30s", "1h 5m".
 *
 * Se corta en dos unidades a propósito: acá los segundos son ruido cuando ya hay horas, y el
 * número existe para dar una idea de la espera, no para cronometrarla.
 */
export function formatDuracion(ms: number): string {
  const segundos = Math.max(0, Math.round(ms / 1000));
  if (segundos < 60) return `${segundos}s`;

  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) {
    const resto = segundos % 60;
    return resto === 0 ? `${minutos}m` : `${minutos}m ${resto}s`;
  }

  const horas = Math.floor(minutos / 60);
  const restoMin = minutos % 60;
  return restoMin === 0 ? `${horas}h` : `${horas}h ${restoMin}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB"];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i++;
  }
  return `${valor.toFixed(1)} ${unidades[i]}`;
}
