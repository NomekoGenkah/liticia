import { prisma } from "../config/prisma";

export interface PerfilEmpresaInput {
  nombre: string;
  descripcion: string;
  rubro: string | null;
  palabrasClave: string[];
  categoriasUnspsc: string[];
  regionesInteres: string[];
  montoMinimo: number | null;
  montoMaximo: number | null;
}

export const perfilEmpresaRepository = {
  async obtener() {
    return prisma.perfilEmpresa.findFirst();
  },

  async guardar(input: PerfilEmpresaInput) {
    const existente = await prisma.perfilEmpresa.findFirst({ select: { id: true } });

    if (!existente) {
      return prisma.perfilEmpresa.create({ data: { ...input, version: 1 } });
    }

    return prisma.perfilEmpresa.update({
      where: { id: existente.id },
      data: { ...input, version: { increment: 1 } },
    });
  },
};
