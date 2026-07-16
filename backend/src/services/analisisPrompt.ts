import type { AnalisisPrompt } from "../clients/ollamaClient";
import type { LicitacionParaAnalisis } from "../clients/ollamaClient.types";

export const PROMPT_VERSION = 1;

const SYSTEM_PROMPT = `Eres un asistente que analiza licitaciones públicas chilenas (Mercado Público / ChileCompra) para una empresa que evalúa si le conviene postular.

Reglas estrictas:
- Responde ÚNICAMENTE con el objeto JSON solicitado, sin texto adicional antes o después, sin explicaciones.
- Básate EXCLUSIVAMENTE en los campos que se te entregan. No inventes requisitos, plazos, montos ni obligaciones que no estén explícitamente presentes en la información dada.
- Si la información es escasa, refleja esa escasez en la respuesta (resúmenes breves, listas cortas) en vez de rellenar con contenido inventado.
- Todo el texto de salida debe estar en español.`;

function formatMonto(montoEstimado: number | null, moneda: string | null): string {
  if (montoEstimado === null) return "no informado";
  return `${montoEstimado.toLocaleString("es-CL")} ${moneda ?? ""}`.trim();
}

function formatFecha(fecha: Date | null): string {
  if (!fecha) return "no informada";
  return fecha.toISOString().slice(0, 10);
}

function formatItems(items: LicitacionParaAnalisis["items"]): string {
  if (items.length === 0) return "(sin ítems informados)";
  return items
    .map((item) => {
      const cantidad = item.cantidad !== null ? `${item.cantidad} ${item.unidadMedida ?? ""}`.trim() : "cantidad no informada";
      const categoria = item.categoriaUnspsc ? ` [categoría UNSPSC: ${item.categoriaUnspsc}]` : "";
      return `- ${item.nombreProducto} (${cantidad})${categoria}`;
    })
    .join("\n");
}

export function buildAnalisisPrompt(licitacion: LicitacionParaAnalisis): AnalisisPrompt {
  const descripcionTexto = licitacion.descripcion?.trim();
  const descripcionSeccion = descripcionTexto
    ? descripcionTexto
    : "(sin descripción disponible — basa el resumen y la extracción solo en el nombre, el organismo y los ítems; no inventes contenido para compensar la falta de descripción, y mantén `puntosClave` mínimo o vacío si no hay información suficiente)";

  const user = `Analiza la siguiente licitación pública y responde con el JSON solicitado.

Nombre: ${licitacion.nombre}
Organismo comprador: ${licitacion.nombreOrganismo ?? "no informado"}
Tipo de licitación: ${licitacion.tipo ?? "no informado"}
Monto estimado: ${formatMonto(licitacion.montoEstimado, licitacion.moneda)}
Fecha de publicación: ${formatFecha(licitacion.fechaPublicacion)}
Fecha de cierre: ${formatFecha(licitacion.fechaCierre)}

Descripción:
${descripcionSeccion}

Ítems:
${formatItems(licitacion.items)}

Genera un objeto JSON con estos campos:
- "resumenEjecutivo": 2 a 4 oraciones en lenguaje simple explicando qué se licita, para quién y el alcance general.
- "puntosClave": lista de strings cortos con requisitos o condiciones concretas efectivamente declaradas en la descripción o los ítems (no infieras obligaciones que no estén escritas).
- "palabrasClave": lista de términos de rubro/categoría útiles para búsquedas futuras, basados en el nombre, la descripción y las categorías UNSPSC de los ítems.
- "nivelComplejidad": "baja", "media" o "alta", ponderando el monto estimado, la diversidad de ítems, el plazo entre publicación y cierre, y el tipo de licitación.`;

  return { system: SYSTEM_PROMPT, user };
}
