import { prisma } from "../config/prisma";
import { config } from "../config/env";
import type { RequestCounterPort } from "../clients/chileCompraClient";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const apiRequestCounterRepository: RequestCounterPort = {
  async incrementarYObtener(fecha: Date) {
    const dia = startOfDay(fecha);

    const registro = await prisma.apiRequestCounter.upsert({
      where: { fecha: dia },
      create: { fecha: dia, contador: 1, limiteDiario: config.CHILECOMPRA_MAX_REQUESTS_DIA },
      update: { contador: { increment: 1 } },
    });

    return { contador: registro.contador, limiteDiario: registro.limiteDiario };
  },
};
