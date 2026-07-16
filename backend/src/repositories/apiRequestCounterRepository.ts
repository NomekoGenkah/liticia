import { prisma } from "../config/prisma";
import { config } from "../config/env";
import type { RequestCounterPort } from "../clients/chileCompraClient";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const apiRequestCounterRepository: RequestCounterPort = {
  async obtener(fecha: Date) {
    const registro = await prisma.apiRequestCounter.findUnique({ where: { fecha: startOfDay(fecha) } });

    return {
      contador: registro?.contador ?? 0,
      // El tope sale de la configuración vigente y no de la fila: la columna deja constancia de con
      // qué tope se corrió ese día, pero una fila vieja no debe seguir imponiendo un límite que ya
      // se cambió en el .env.
      limiteDiario: config.CHILECOMPRA_MAX_REQUESTS_DIA,
    };
  },

  async registrar(fecha: Date) {
    const dia = startOfDay(fecha);

    await prisma.apiRequestCounter.upsert({
      where: { fecha: dia },
      create: { fecha: dia, contador: 1, limiteDiario: config.CHILECOMPRA_MAX_REQUESTS_DIA },
      update: { contador: { increment: 1 }, limiteDiario: config.CHILECOMPRA_MAX_REQUESTS_DIA },
    });
  },
};
