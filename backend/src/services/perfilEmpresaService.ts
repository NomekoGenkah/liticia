import type { perfilEmpresaRepository, PerfilEmpresaInput } from "../repositories/perfilEmpresaRepository";
import { NotFoundError } from "../utils/errors";

export class PerfilEmpresaService {
  constructor(private readonly perfilEmpresaRepo: typeof perfilEmpresaRepository) {}

  async obtener() {
    const perfil = await this.perfilEmpresaRepo.obtener();
    if (!perfil) {
      throw new NotFoundError("No hay un perfil de empresa configurado todavía", "PERFIL_EMPRESA_NO_CONFIGURADO");
    }
    return perfil;
  }

  async guardar(input: PerfilEmpresaInput) {
    return this.perfilEmpresaRepo.guardar(input);
  }
}
