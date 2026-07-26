import type { ProveedorIA } from "@prisma/client";
import { prisma } from "../config/prisma";

export interface ConfiguracionIaInput {
  proveedor: ProveedorIA;
  modeloChat: string | null;
  vramBudgetMb: number | null;
  ramBudgetMb: number | null;
}

/** Fila única, mismo patrón que `perfilEmpresaRepository`: findFirst + create-or-update. */
export const configuracionIaRepository = {
  async obtener() {
    return prisma.configuracionIA.findFirst();
  },

  async guardar(input: ConfiguracionIaInput) {
    const existente = await prisma.configuracionIA.findFirst({ select: { id: true } });

    if (!existente) {
      return prisma.configuracionIA.create({ data: { ...input, version: 1 } });
    }

    return prisma.configuracionIA.update({
      where: { id: existente.id },
      data: { ...input, version: { increment: 1 } },
    });
  },
};
