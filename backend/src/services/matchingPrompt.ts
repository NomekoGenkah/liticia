import type { MatchingPrompt } from "../clients/ollamaClient";
import type { LicitacionParaMatching, PerfilEmpresaParaMatching } from "../clients/ollamaClient.types";

export const MATCHING_PROMPT_VERSION = 1;

const SYSTEM_PROMPT = `Eres un asistente que evalúa si a una empresa le conviene postular a una licitación pública chilena (Mercado Público / ChileCompra) que ya fue analizada previamente.

Reglas estrictas:
- Responde ÚNICAMENTE con el objeto JSON solicitado, sin texto adicional antes o después, sin explicaciones.
- Básate EXCLUSIVAMENTE en el perfil de la empresa y el análisis de la licitación que se te entregan. No inventes afinidad, requisitos ni motivos de descarte que no estén explícitamente respaldados por esos datos.
- Si el perfil no declaró algún criterio (categorías, región, rango de monto), no lo uses como motivo de descarte — pondera más el calce semántico entre la descripción/rubro de la empresa y el resumen/palabras clave de la licitación.
- Usa "tal_vez" cuando la información disponible sea insuficiente para una recomendación segura, en vez de forzar "si" o "no".
- Todo el texto de salida debe estar en español.`;

function formatLista(items: string[], vacio: string): string {
  return items.length > 0 ? items.join(", ") : vacio;
}

function formatMonto(monto: number | null, moneda?: string | null): string {
  if (monto === null) return "no informado";
  return `${monto.toLocaleString("es-CL")}${moneda ? ` ${moneda}` : ""}`;
}

function formatRangoMonto(montoMinimo: number | null, montoMaximo: number | null): string {
  if (montoMinimo === null && montoMaximo === null) return "no declarado";
  return `${formatMonto(montoMinimo)} a ${formatMonto(montoMaximo)}`;
}

function formatFecha(fecha: Date | null): string {
  if (!fecha) return "no informada";
  return fecha.toISOString().slice(0, 10);
}

function formatPerfil(perfil: PerfilEmpresaParaMatching): string {
  return `Nombre: ${perfil.nombre}
Descripción: ${perfil.descripcion}
Rubro: ${perfil.rubro ?? "no informado"}
Palabras clave de interés: ${formatLista(perfil.palabrasClave, "no declaradas")}
Categorías UNSPSC de interés: ${formatLista(perfil.categoriasUnspsc, "no declaradas")}
Regiones de interés: ${formatLista(perfil.regionesInteres, "no declaradas")}
Rango de monto de interés: ${formatRangoMonto(perfil.montoMinimo, perfil.montoMaximo)}`;
}

function formatLicitacion(licitacion: LicitacionParaMatching): string {
  return `Nombre: ${licitacion.nombre}
Organismo comprador: ${licitacion.nombreOrganismo ?? "no informado"}
Tipo de licitación: ${licitacion.tipo ?? "no informado"}
Monto estimado: ${formatMonto(licitacion.montoEstimado, licitacion.moneda)}
Región: ${licitacion.regionUnidad ?? "no informada"}
Fecha de cierre: ${formatFecha(licitacion.fechaCierre)}

Resumen ejecutivo: ${licitacion.analisis.resumenEjecutivo ?? "no disponible"}
Puntos clave: ${formatLista(licitacion.analisis.puntosClave, "(sin puntos clave)")}
Palabras clave: ${formatLista(licitacion.analisis.palabrasClave, "(sin palabras clave)")}
Nivel de complejidad: ${licitacion.analisis.nivelComplejidad ?? "no informado"}`;
}

export function buildMatchingPrompt(
  perfil: PerfilEmpresaParaMatching,
  licitacion: LicitacionParaMatching
): MatchingPrompt {
  const user = `Evalúa si a la siguiente empresa le conviene postular a la siguiente licitación y responde con el JSON solicitado.

Perfil de la empresa:
${formatPerfil(perfil)}

Licitación (ya analizada):
${formatLicitacion(licitacion)}

Genera un objeto JSON con estos campos:
- "puntaje": número entero de 0 a 100 que refleje qué tan bien calza la licitación con el perfil de la empresa, ponderando rubro/palabras clave/categorías UNSPSC, si el monto estimado cae dentro del rango de interés declarado (si hay uno) y si la región calza (si se declaró alguna).
- "recomendacion": "si", "no" o "tal_vez", según la conveniencia de postular.
- "justificacion": 1 a 3 oraciones explicando el puntaje y la recomendación en términos de los datos entregados.`;

  return { system: SYSTEM_PROMPT, user };
}
