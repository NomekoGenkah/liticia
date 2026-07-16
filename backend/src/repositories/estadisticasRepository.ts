import { prisma } from "../config/prisma";

/** Cuántas licitaciones activas cierran cada día del horizonte. */
export interface CierrePorDia {
  /** Fecha en formato YYYY-MM-DD. */
  dia: string;
  total: number;
}

export interface EstadisticasPanel {
  activas: number;
  cierran7Dias: number;
  cierran48Horas: number;
  /** Activas cuyo plazo de cierre ya pasó: siguen "Publicada" pero no se puede postular. */
  vencidas: number;
  totalLicitaciones: number;
  analizadasActivas: number;
  matcheadasActivas: number;
  recomendadasSi: number;
  hayPerfil: boolean;
  cierresPorDia: CierrePorDia[];
}

const DIAS_HORIZONTE = 14;

export const estadisticasRepository = {
  async obtenerPanel(): Promise<EstadisticasPanel> {
    const activas = { estado: { equals: "Publicada", mode: "insensitive" as const } };
    const ahora = new Date();
    const en48Horas = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);
    const en7Dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);

    // date_trunc + count agrupado: mucho más barato que traerse las 266 filas para agrupar en JS.
    // El COUNT vuelve como BigInt, así que se castea a int en el SQL — si no, JSON.stringify falla.
    const cierresPorDia = prisma.$queryRaw<CierrePorDia[]>`
      SELECT to_char(date_trunc('day', "fechaCierre"), 'YYYY-MM-DD') AS "dia",
             count(*)::int AS "total"
      FROM "Licitacion"
      WHERE lower("estado") = 'publicada'
        AND "fechaCierre" >= date_trunc('day', now())
        AND "fechaCierre" < date_trunc('day', now()) + make_interval(days => ${DIAS_HORIZONTE}::int)
      GROUP BY 1
      ORDER BY 1
    `;

    const [
      totalActivas,
      cierran7Dias,
      cierran48Horas,
      vencidas,
      totalLicitaciones,
      analizadasActivas,
      matcheadasActivas,
      recomendadasSi,
      perfiles,
      dias,
    ] = await Promise.all([
      prisma.licitacion.count({ where: activas }),
      prisma.licitacion.count({ where: { ...activas, fechaCierre: { gte: ahora, lte: en7Dias } } }),
      prisma.licitacion.count({ where: { ...activas, fechaCierre: { gte: ahora, lte: en48Horas } } }),
      prisma.licitacion.count({ where: { ...activas, fechaCierre: { lt: ahora } } }),
      prisma.licitacion.count(),
      prisma.licitacion.count({ where: { ...activas, analisis: { estado: "COMPLETADO" } } }),
      prisma.licitacion.count({ where: { ...activas, matching: { estado: "COMPLETADO" } } }),
      prisma.licitacion.count({ where: { ...activas, matching: { recomendacion: "SI" } } }),
      prisma.perfilEmpresa.count(),
      cierresPorDia,
    ]);

    return {
      activas: totalActivas,
      cierran7Dias,
      cierran48Horas,
      vencidas,
      totalLicitaciones,
      analizadasActivas,
      matcheadasActivas,
      recomendadasSi,
      hayPerfil: perfiles > 0,
      cierresPorDia: dias,
    };
  },
};
