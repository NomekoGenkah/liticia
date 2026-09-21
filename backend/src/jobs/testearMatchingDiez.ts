import fs from "node:fs/promises";
import path from "node:path";
import { ChileCompraClient } from "../clients/chileCompraClient";
import type { LicitacionDetalleRaw } from "../clients/chileCompraClient.types";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { apiRequestCounterRepository } from "../repositories/apiRequestCounterRepository";
import { analisisLicitacionRepository } from "../repositories/analisisLicitacionRepository";
import { licitacionRepository, type LicitacionUpsertInput } from "../repositories/licitacionRepository";
import { perfilEmpresaRepository } from "../repositories/perfilEmpresaRepository";
import { getRunner } from "../services/procesos/registry";

const FICHA_PUBLICA_BASE = "https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx";

function toDateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function mapDetalleToUpsertInput(detalle: LicitacionDetalleRaw): LicitacionUpsertInput {
  return {
    codigoExterno: detalle.CodigoExterno,
    nombre: detalle.Nombre,
    codigoEstado: detalle.CodigoEstado,
    estado: detalle.Estado,
    descripcion: detalle.Descripcion,
    nombreOrganismo: detalle.Comprador?.NombreOrganismo ?? null,
    codigoOrganismo: detalle.Comprador?.CodigoOrganismo ?? null,
    rutOrganismo: detalle.Comprador?.RutUnidad ?? null,
    regionUnidad: detalle.Comprador?.RegionUnidad ?? null,
    comunaUnidad: detalle.Comprador?.ComunaUnidad ?? null,
    fechaPublicacion: toDateOrNull(detalle.Fechas?.FechaPublicacion),
    fechaCierre: toDateOrNull(detalle.Fechas?.FechaCierre),
    fechaAdjudicacion: toDateOrNull(detalle.Fechas?.FechaAdjudicacion),
    montoEstimado: detalle.MontoEstimado,
    visibilidadMonto: detalle.VisibilidadMonto,
    moneda: detalle.Moneda,
    tipo: detalle.Tipo,
    codigoTipo: detalle.CodigoTipo,
    etapas: detalle.Etapas,
    estadoEtapas: detalle.EstadoEtapas,
    subContratacion: detalle.SubContratacion ? Number(detalle.SubContratacion) : null,
    urlActaAdjudicacion: detalle.Adjudicacion?.UrlActa ?? null,
    urlFichaPublica: `${FICHA_PUBLICA_BASE}?idlicitacion=${encodeURIComponent(detalle.CodigoExterno)}`,
    rawResponse: detalle as unknown as LicitacionUpsertInput["rawResponse"],
    items: (detalle.Items?.Listado ?? []).map((item) => ({
      nombreProducto: item.NombreProducto,
      categoriaUnspsc: item.CodigoCategoria ?? null,
      cantidad: item.Cantidad ?? null,
      unidadMedida: item.UnidadMedida ?? null,
    })),
  };
}

async function asegurarPerfil() {
  const existente = await perfilEmpresaRepository.obtener();
  if (existente) {
    logger.info({ nombre: existente.nombre }, "Perfil de empresa ya existe");
    return existente;
  }

  logger.info("Configurando perfil de empresa para la prueba...");
  return await perfilEmpresaRepository.guardar({
    tipo: "EMPRESA",
    nombre: "Constructora e Ingeniería Andes SpA",
    descripcion:
      "Empresa chilena especializada en obras civiles, construcción, mantención de infraestructura y suministro de materiales.",
    rubro: "Construcción y Mantención de Infraestructura",
    palabrasClave: [
      "construcción",
      "obras",
      "suministro",
      "materiales",
      "mantención",
      "infraestructura",
      "tuberías",
      "polietileno",
      "viales",
    ],
    categoriasUnspsc: ["72101507", "30141500", "40171500", "72141000"],
    regionesInteres: ["Biobío", "Metropolitana", "Valparaíso"],
    montoMinimo: 1000000,
    montoMaximo: 100000000,
  });
}

async function obtenerOIngestarDiezLicitaciones(chileCompraClient: ChileCompraClient) {
  const existentes = await prisma.licitacion.findMany({
    take: 10,
    select: { id: true, codigoExterno: true },
    orderBy: { primeraVezVisto: "desc" },
  });

  if (existentes.length >= 10) {
    logger.info({ cantidad: existentes.length }, "Usando 10 licitaciones existentes en la base de datos");
    return existentes.map((l) => l.id);
  }

  logger.info("Buscando licitaciones activas desde ChileCompra API...");
  const searchResults = await chileCompraClient.search({ estado: "activas" });
  logger.info({ totalEncontradas: searchResults.length }, "Listado obtenido de ChileCompra");

  const diezItems = searchResults.slice(0, 10);
  const ids: string[] = [];

  for (let i = 0; i < diezItems.length; i++) {
    const item = diezItems[i]!;
    logger.info(`[${i + 1}/10] Obteniendo detalle de licitación ${item.CodigoExterno}...`);
    const detalle = await chileCompraClient.getDetail(item.CodigoExterno);
    if (!detalle) {
      logger.warn({ codigo: item.CodigoExterno }, "No se pudo obtener el detalle");
      continue;
    }

    const upsertInput = mapDetalleToUpsertInput(detalle);
    await licitacionRepository.upsertPorCodigoExterno(upsertInput);
    const licitacion = await prisma.licitacion.findUniqueOrThrow({
      where: { codigoExterno: upsertInput.codigoExterno },
      select: { id: true },
    });
    ids.push(licitacion.id);
  }

  return ids;
}

async function main() {
  console.log("===============================================================================");
  console.log("🚀 INICIANDO TEST DE EVALUACIÓN CON TYPESAFE AI (SYSTEM ONE - JEV)");
  console.log(`Matching Provider: ${config.MATCHING_PROVIDER}`);
  console.log(`TypeSafe Model:    ${config.TYPESAFE_MODEL}`);
  console.log("===============================================================================\n");

  await asegurarPerfil();

  const chileCompraClient = new ChileCompraClient(
    {
      ticket: config.CHILECOMPRA_TICKET,
      apiBase: config.CHILECOMPRA_API_BASE,
      timeoutMs: config.CHILECOMPRA_REQUEST_TIMEOUT_MS,
      retryMax: config.CHILECOMPRA_RETRY_MAX,
      retryBaseDelayMs: config.CHILECOMPRA_RETRY_BASE_DELAY_MS,
      maxRequestsDia: config.CHILECOMPRA_MAX_REQUESTS_DIA,
    },
    apiRequestCounterRepository
  );

  const ids = await obtenerOIngestarDiezLicitaciones(chileCompraClient);
  console.log(`\n✅ 10 licitaciones listas en la base de datos (evaluación directa sin análisis previo).`);
  console.log(`\n⏳ Ejecutando proceso de matching directo con TypeSafe AI sobre las 10 licitaciones...`);

  const runner = getRunner("MATCHING");
  const resumen = await runner.ejecutar({ modo: "IDS", ids }, "CLI");

  console.log("\n📊 Resumen de ejecución del runner:", resumen);

  // Consultar los matchings guardados en la BD
  const resultados = await prisma.licitacionMatching.findMany({
    where: { licitacionId: { in: ids } },
    include: {
      licitacion: {
        select: {
          codigoExterno: true,
          nombre: true,
          nombreOrganismo: true,
          montoEstimado: true,
          moneda: true,
        },
      },
    },
    orderBy: { puntaje: "desc" },
  });

  let informe = "";
  informe += "===================================================================================\n";
  informe += "          RESULTADOS DE CALIFICACIÓN DE LICITACIONES CON TYPESAFE AI (JEV)         \n";
  informe += `Fecha: ${new Date().toISOString()} | Modelo: ${config.TYPESAFE_MODEL}\n`;
  informe += "===================================================================================\n\n";

  console.log("\n" + informe);

  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i]!;
    const lic = r.licitacion;
    const montoFmt = lic.montoEstimado ? `$${Number(lic.montoEstimado).toLocaleString("es-CL")} ${lic.moneda ?? "CLP"}` : "No informado";

    const bloque = `-----------------------------------------------------------------------------------
[#${i + 1}] Licitación: ${lic.codigoExterno} - ${lic.nombre}
Organismo: ${lic.nombreOrganismo ?? "No informado"}
Monto Estimado: ${montoFmt}
PUNTAJE: ${r.puntaje}/100 | RECOMENDACIÓN: ${r.recomendacion} | DURACIÓN: ${r.duracionMs}ms | MODELO: ${r.modelo}
JUSTIFICACIÓN:
${r.justificacion}
`;

    console.log(bloque);
    informe += bloque + "\n";
  }

  informe += "===================================================================================\n";
  informe += `TOTAL EVALUADAS: ${resultados.length}/10\n`;
  informe += `PROMEDIO PUNTAJE: ${Math.round(resultados.reduce((acc, curr) => acc + (curr.puntaje ?? 0), 0) / (resultados.length || 1))}/100\n`;
  informe += "===================================================================================\n";

  const outputPath = path.resolve(__dirname, "../../storage/resultados_matching_typesafe.txt");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, informe, "utf-8");

  console.log(`\n💾 Resultados guardados exitosamente en: ${outputPath}`);
}

main()
  .then(() => {
    console.log("\n🎉 Proceso completado exitosamente con Docker y TypeSafe AI.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error durante la ejecución:", err);
    process.exit(1);
  });
