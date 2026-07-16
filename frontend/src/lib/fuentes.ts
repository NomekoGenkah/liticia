/**
 * Las fuentes se sirven desde node_modules (@fontsource), no desde un CDN: LicitIA corre entera
 * en tu máquina y tiene que seguir funcionando sin internet.
 *
 * El catálogo no es una lista al azar: la app muestra tablas densas y textos legales largos, así
 * que cada opción está acá por una razón concreta.
 */
export interface OpcionFuente {
  id: string;
  nombre: string;
  /** Por qué elegirías esta y no otra. Se muestra en el selector. */
  razon: string;
  stack: string;
}

export const FUENTES: OpcionFuente[] = [
  {
    id: "geist",
    nombre: "Geist",
    razon: "Neo-grotesca compacta. La que trae LicitIA de fábrica.",
    stack: "'Geist Variable', sans-serif",
  },
  {
    id: "montserrat",
    nombre: "Montserrat",
    razon: "Geométrica y ancha. Títulos con más presencia.",
    stack: "'Montserrat Variable', sans-serif",
  },
  {
    id: "inter",
    nombre: "Inter",
    razon: "Diseñada para pantallas. Muy legible en tamaños chicos.",
    stack: "'Inter Variable', sans-serif",
  },
  {
    id: "ibm-plex",
    nombre: "IBM Plex Sans",
    razon: "Humanista. Cómoda en formularios y fichas largas.",
    stack: "'IBM Plex Sans Variable', sans-serif",
  },
  {
    id: "atkinson",
    nombre: "Atkinson Hyperlegible",
    razon: "Del Braille Institute: separa caracteres que suelen confundirse.",
    stack: "'Atkinson Hyperlegible', sans-serif",
  },
  {
    id: "literata",
    nombre: "Literata",
    razon: "Serif de lectura. Para leer bases largas sin cansarte.",
    stack: "'Literata Variable', serif",
  },
];

export const FUENTE_POR_DEFECTO = "geist";

export const CLAVE_FUENTE = "licitia:fuente";

export function resolverStack(id: string): string {
  return (FUENTES.find((fuente) => fuente.id === id) ?? FUENTES[0]!).stack;
}

/** Aplica la fuente pisando el token que Tailwind usa para `font-sans`. */
export function aplicarFuente(id: string): void {
  document.documentElement.style.setProperty("--font-sans", resolverStack(id));
}
