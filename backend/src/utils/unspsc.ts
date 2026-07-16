import type { Prisma } from "@prisma/client";

/**
 * Los códigos UNSPSC son jerárquicos: los 2 primeros dígitos son el segmento, los 4 primeros la
 * familia y los 8 el producto puntual. `43231500` es segmento 43 (tecnologías de información),
 * familia 4323 (software).
 *
 * Acá solo se usa el segmento, y es una decisión deliberada: el código clasifica bien lo lejano y
 * mal lo cercano. En los datos reales, "Servicio implementación Jira" viene clasificado como
 * 43231500 ("paquetes de software para oficinas") — filtrar por código exacto la dejaría fuera, y
 * en cambio dejaría pasar enlaces de internet que comparten código con el perfil. Por eso el
 * segmento se usa como red amplia para no gastar LLM en lo obviamente ajeno (neumáticos, vendajes),
 * y la decisión fina se la deja al modelo, que sí entiende que Jira es desarrollo.
 */
const LARGO_SEGMENTO = 2;

/** Segmentos únicos de una lista de códigos UNSPSC. Ignora los que no tengan el largo mínimo. */
export function segmentosDe(categorias: string[]): string[] {
  const segmentos = new Set<string>();

  for (const categoria of categorias) {
    const limpio = categoria.trim();
    if (limpio.length >= LARGO_SEGMENTO) segmentos.add(limpio.slice(0, LARGO_SEGMENTO));
  }

  return [...segmentos].sort();
}

/**
 * Cláusula para quedarse solo con licitaciones que tengan al menos un ítem de esos segmentos.
 * Con la lista vacía devuelve `{}`, o sea no filtra nada: sin perfil (o con un perfil sin
 * categorías) los batches siguen procesando todo, como antes de este filtro.
 */
export function filtroPorSegmentos(segmentos: string[]): Prisma.LicitacionWhereInput {
  if (segmentos.length === 0) return {};

  return {
    items: { some: { OR: segmentos.map((segmento) => ({ categoriaUnspsc: { startsWith: segmento } })) } },
  };
}
