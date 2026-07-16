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
