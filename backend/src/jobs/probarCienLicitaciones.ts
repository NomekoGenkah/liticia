import fs from "node:fs/promises";
import path from "node:path";
import { ChileCompraClient } from "../clients/chileCompraClient";
import type { LicitacionDetalleRaw } from "../clients/chileCompraClient.types";
import { config } from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { apiRequestCounterRepository } from "../repositories/apiRequestCounterRepository";
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

async function configurarPerfilUsuario() {
  console.log("⚙️  Configurando perfil de usuario enfocado en Desarrollo de Software, IT, Remoto y Coquimbo...");

  const perfil = await perfilEmpresaRepository.guardar({
    tipo: "EMPRESA",
    nombre: "Soluciones y Desarrollo Web Digital SpA",
    descripcion:
      "Empresa tecnológica dedicada al diseño y desarrollo de plataformas web, software a medida, aplicaciones móviles, sistemas cloud, consultoría TI e integración de sistemas. Modalidad de trabajo preferente remota o con presencia en la Región de Coquimbo.",
    rubro: "Tecnología de la Información, Desarrollo de Software y Plataformas Web",
    palabrasClave: [
      "desarrollo de software",
      "software",
      "plataformas web",
      "desarrollo web",
      "aplicaciones web",
      "tecnología",
      "TI",
      "sistemas informáticos",
      "cloud",
      "remoto",
      "Coquimbo",
      "programación",
      "soporte informático",
    ],
    categoriasUnspsc: [
      "43230000",
      "43231500",
      "43231600",
      "43232400",
      "81111500",
      "81111800",
      "81112000",
      "81112100",
      "81112200",
    ],
    regionesInteres: ["Región de Coquimbo", "Coquimbo", "Remoto", "Nacional"],
    montoMinimo: 1000000,
    montoMaximo: 150000000,
  });

  console.log(`✅ Perfil configurado: "${perfil.nombre}" (v${perfil.version})`);
  console.log(`   Rubro: ${perfil.rubro}`);
  console.log(`   Regiones de interés: ${perfil.regionesInteres.join(", ")}`);
  console.log(`   Categorías UNSPSC: ${perfil.categoriasUnspsc.join(", ")}\n`);
  return perfil;
}

async function obtenerOIngestarCienLicitaciones(chileCompraClient: ChileCompraClient, objetivo: number = 100) {
  console.log(`📥 Buscando licitaciones activas desde ChileCompra API para alcanzar ${objetivo}...`);
  const searchResults = await chileCompraClient.search({ estado: "activas" });
  console.log(`ℹ️  Total encontradas activas en ChileCompra: ${searchResults.length}`);

  const ids: string[] = [];
  let descargadasNuevas = 0;
  let yaExistentes = 0;

  for (let i = 0; i < searchResults.length && ids.length < objetivo; i++) {
    const item = searchResults[i]!;

    try {
      const existente = await prisma.licitacion.findUnique({
        where: { codigoExterno: item.CodigoExterno },
        select: { id: true, descripcion: true },
      });

      if (existente && existente.descripcion) {
        ids.push(existente.id);
        yaExistentes++;
        process.stdout.write(`\r[${ids.length}/${objetivo}] Licitación ${item.CodigoExterno} ya en BD`);
        continue;
      }

      process.stdout.write(`\r[${ids.length + 1}/${objetivo}] Descargando detalle ${item.CodigoExterno}...             `);
      const detalle = await chileCompraClient.getDetail(item.CodigoExterno);

      if (!detalle) {
        logger.warn({ codigo: item.CodigoExterno }, "Sin detalle disponible");
        continue;
      }

      const upsertInput = mapDetalleToUpsertInput(detalle);
      await licitacionRepository.upsertPorCodigoExterno(upsertInput);
      const licitacion = await prisma.licitacion.findUniqueOrThrow({
        where: { codigoExterno: upsertInput.codigoExterno },
        select: { id: true },
      });
      ids.push(licitacion.id);
      descargadasNuevas++;

      // Pausa de cortesía de 300ms entre solicitudes para evitar rate-limiting (429)
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), codigo: item.CodigoExterno },
        "Error temporal en getDetail, continuando con la siguiente licitación"
      );
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  console.log(`\n\n✅ Licitaciones preparadas: ${ids.length} (Nuevas descargadas: ${descargadasNuevas}, Ya en BD: ${yaExistentes})`);
  return ids;
}

function formatMonto(monto: number | null, moneda: string | null): string {
  if (monto === null || monto === undefined) return "No informado";
  return `$${monto.toLocaleString("es-CL")}${moneda ? ` ${moneda}` : ""}`;
}

async function main() {
  console.log("===============================================================================");
  console.log("🚀 INICIANDO PRUEBA DE 100 LICITACIONES CON TYPESAFE AI (SYSTEM ONE - JEV)");
  console.log(`Matching Provider: ${config.MATCHING_PROVIDER}`);
  console.log(`TypeSafe Model:    ${config.TYPESAFE_MODEL}`);
  console.log("===============================================================================\n");

  const perfil = await configurarPerfilUsuario();

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

  const ids = await obtenerOIngestarCienLicitaciones(chileCompraClient, 100);

  console.log(`\n⏳ Ejecutando matching directo con TypeSafe AI sobre ${ids.length} licitaciones...`);
  const tInicio = Date.now();

  const runner = getRunner("MATCHING");
  const resumen = await runner.ejecutar({ modo: "IDS", ids }, "CLI");
  const tTotalSegundos = Number(((Date.now() - tInicio) / 1000).toFixed(1));

  console.log(`\n📊 Ejecución del runner completada en ${tTotalSegundos}s:`, resumen);

  // Consultar todos los matchings de las licitaciones evaluadas
  const matchings = await prisma.licitacionMatching.findMany({
    where: { licitacionId: { in: ids } },
    include: {
      licitacion: {
        select: {
          codigoExterno: true,
          nombre: true,
          descripcion: true,
          nombreOrganismo: true,
          regionUnidad: true,
          montoEstimado: true,
          moneda: true,
          urlFichaPublica: true,
        },
      },
    },
  });

  // Ordenar de mayor a menor puntaje
  const resultadosOrdenados = matchings.sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0));

  const countSi = resultadosOrdenados.filter((r) => r.recomendacion === "SI").length;
  const countTalVez = resultadosOrdenados.filter((r) => r.recomendacion === "TAL_VEZ").length;
  const countNo = resultadosOrdenados.filter((r) => r.recomendacion === "NO").length;
  const puntajePromedio = Math.round(
    resultadosOrdenados.reduce((acc, curr) => acc + (curr.puntaje ?? 0), 0) / (resultadosOrdenados.length || 1)
  );
  const duracionPromedioMs = Math.round(
    resultadosOrdenados.reduce((acc, curr) => acc + (curr.duracionMs ?? 0), 0) / (resultadosOrdenados.length || 1)
  );

  // 1. Estructurar archivo JSON
  const jsonReporte = {
    metadata: {
      fecha: new Date().toISOString(),
      proveedor: config.MATCHING_PROVIDER,
      modelo: config.TYPESAFE_MODEL,
      totalEvaluadas: resultadosOrdenados.length,
      perfil: {
        id: perfil.id,
        nombre: perfil.nombre,
        tipo: perfil.tipo,
        rubro: perfil.rubro,
        descripcion: perfil.descripcion,
        palabrasClave: perfil.palabrasClave,
        categoriasUnspsc: perfil.categoriasUnspsc,
        regionesInteres: perfil.regionesInteres,
        montoMinimo: perfil.montoMinimo ? Number(perfil.montoMinimo) : null,
        montoMaximo: perfil.montoMaximo ? Number(perfil.montoMaximo) : null,
        version: perfil.version,
      },
      estadisticas: {
        recomendadasSi: countSi,
        recomendadasTalVez: countTalVez,
        recomendadasNo: countNo,
        puntajePromedio,
        puntajeMaximo: resultadosOrdenados[0]?.puntaje ?? 0,
        puntajeMinimo: resultadosOrdenados[resultadosOrdenados.length - 1]?.puntaje ?? 0,
        duracionPromedioMs,
        duracionTotalSegundos: tTotalSegundos,
      },
    },
    resultados: resultadosOrdenados.map((m, idx) => ({
      posicion: idx + 1,
      codigoExterno: m.licitacion.codigoExterno,
      nombre: m.licitacion.nombre,
      organismo: m.licitacion.nombreOrganismo,
      region: m.licitacion.regionUnidad,
      montoEstimado: m.licitacion.montoEstimado ? Number(m.licitacion.montoEstimado) : null,
      moneda: m.licitacion.moneda,
      puntaje: m.puntaje,
      recomendacion: m.recomendacion,
      justificacion: m.justificacion,
      duracionMs: m.duracionMs,
      urlFichaPublica: m.licitacion.urlFichaPublica,
    })),
  };

  const jsonOutputPath = path.resolve(__dirname, "../../storage/resultados_matching_100.json");
  await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
  await fs.writeFile(jsonOutputPath, JSON.stringify(jsonReporte, null, 2), "utf-8");

  // 2. Estructurar archivo TXT para comparación a simple vista
  let txtReporte = "===================================================================================\n";
  txtReporte += "           RESULTADOS DE CALIFICACIÓN: 100 LICITACIONES (TYPESAFE AI JEV)          \n";
  txtReporte += `Fecha: ${new Date().toISOString()} | Modelo: ${config.TYPESAFE_MODEL} | Proveedor: ${config.MATCHING_PROVIDER}\n`;
  txtReporte += `Perfil: ${perfil.nombre} (${perfil.rubro})\n`;
  txtReporte += `Enfoque: Desarrollo de Software, Plataformas Web, Cloud, IT, Remoto y Coquimbo\n`;
  txtReporte += "===================================================================================\n\n";

  txtReporte += "MÉTRICAS GLOBALES:\n";
  txtReporte += `• Total Evaluadas:         ${resultadosOrdenados.length}\n`;
  txtReporte += `• Recomendadas 'SI':       ${countSi} (${Math.round((countSi / (resultadosOrdenados.length || 1)) * 100)}%)\n`;
  txtReporte += `• Recomendadas 'TAL_VEZ':  ${countTalVez} (${Math.round((countTalVez / (resultadosOrdenados.length || 1)) * 100)}%)\n`;
  txtReporte += `• Recomendadas 'NO':       ${countNo} (${Math.round((countNo / (resultadosOrdenados.length || 1)) * 100)}%)\n`;
  txtReporte += `• Puntaje Promedio:        ${puntajePromedio}/100\n`;
  txtReporte += `• Tiempo Promedio LLM:     ${duracionPromedioMs} ms\n`;
  txtReporte += `• Tiempo Total Proceso:    ${tTotalSegundos} s\n\n`;

  txtReporte += "===================================================================================\n";
  txtReporte += "TOP LICITACIONES CON MAYOR AFINIDAD (RECOMENDACIÓN 'SI' O 'TAL_VEZ'):\n";
  txtReporte += "===================================================================================\n";

  const topAfinidad = resultadosOrdenados.filter((r) => r.recomendacion !== "NO" || (r.puntaje ?? 0) >= 60);
  const topMostrar = topAfinidad.length > 0 ? topAfinidad : resultadosOrdenados.slice(0, 10);

  for (let i = 0; i < topMostrar.length; i++) {
    const r = topMostrar[i]!;
    txtReporte += `\n[#${i + 1}] PUNTAJE: ${r.puntaje}/100 | RECOMENDACIÓN: ${r.recomendacion} | DURACIÓN: ${r.duracionMs}ms\n`;
    txtReporte += `     Código:    ${r.licitacion.codigoExterno}\n`;
    txtReporte += `     Nombre:    ${r.licitacion.nombre}\n`;
    txtReporte += `     Organismo: ${r.licitacion.nombreOrganismo ?? "No informado"}\n`;
    txtReporte += `     Región:    ${r.licitacion.regionUnidad ?? "No informada"}\n`;
    txtReporte += `     Monto:     ${formatMonto(r.licitacion.montoEstimado ? Number(r.licitacion.montoEstimado) : null, r.licitacion.moneda)}\n`;
    txtReporte += `     Motivo:    ${r.justificacion ?? "Sin justificación"}\n`;
    txtReporte += `     Ficha:     ${r.licitacion.urlFichaPublica}\n`;
  }

  txtReporte += "\n===================================================================================\n";
  txtReporte += "TABLA COMPLETA RESUMIDA DE LAS LICITACIONES EVALUADAS (ORDEN DE PUNTAJE):\n";
  txtReporte += "===================================================================================\n";
  txtReporte += "POS | PUNTAJE | REC.    | CÓDIGO         | REGIÓN                         | NOMBRE\n";
  txtReporte += "----+---------+---------+----------------+--------------------------------+-------------------------------------------------\n";

  for (let i = 0; i < resultadosOrdenados.length; i++) {
    const r = resultadosOrdenados[i]!;
    const pos = String(i + 1).padStart(3, "0");
    const puntaje = `${String(r.puntaje ?? 0).padStart(3, " ")}/100`;
    const rec = (r.recomendacion ?? "N/A").padEnd(7, " ");
    const codigo = r.licitacion.codigoExterno.padEnd(14, " ");
    const region = (r.licitacion.regionUnidad ?? "Nacional").slice(0, 30).padEnd(30, " ");
    const nombre = r.licitacion.nombre.slice(0, 48);
    txtReporte += `${pos} | ${puntaje} | ${rec} | ${codigo} | ${region} | ${nombre}\n`;
  }

  const txtOutputPath = path.resolve(__dirname, "../../storage/resultados_matching_100.txt");
  await fs.writeFile(txtOutputPath, txtReporte, "utf-8");

  console.log(`\n💾 Archivo JSON guardado exitosamente en: ${jsonOutputPath}`);
  console.log(`💾 Archivo TXT guardado exitosamente en:  ${txtOutputPath}`);

  console.log("\n===============================================================================");
  console.log("🏆 TOP MEJORES MATCHES ENCONTRADOS:");
  console.log("===============================================================================");
  topMostrar.slice(0, 5).forEach((r, idx) => {
    console.log(`[#${idx + 1}] ${r.puntaje}/100 | ${r.recomendacion} | ${r.licitacion.codigoExterno} - ${r.licitacion.nombre}`);
    console.log(`     Región: ${r.licitacion.regionUnidad ?? "Nacional"} | Monto: ${formatMonto(r.licitacion.montoEstimado ? Number(r.licitacion.montoEstimado) : null, r.licitacion.moneda)}`);
    console.log(`     ${r.justificacion}\n`);
  });
}

main()
  .then(() => {
    console.log("🎉 Prueba de 100 licitaciones completada exitosamente.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error ejecutando la prueba:", err);
    process.exit(1);
  });
