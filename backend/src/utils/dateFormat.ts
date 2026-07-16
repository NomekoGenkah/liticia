/** Convierte un Date a formato ddmmaaaa que espera la API de ChileCompra. */
export function toChileCompraDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

/** Parsea un ddmmaaaa de vuelta a Date (mediodía UTC para evitar corrimientos de zona horaria). */
export function fromChileCompraDate(value: string): Date {
  const dd = Number(value.slice(0, 2));
  const mm = Number(value.slice(2, 4));
  const yyyy = Number(value.slice(4, 8));
  return new Date(Date.UTC(yyyy, mm - 1, dd, 12));
}
