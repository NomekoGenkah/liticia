import type { estadisticasRepository } from "../repositories/estadisticasRepository";

export class EstadisticasService {
  constructor(private readonly repo: typeof estadisticasRepository) {}

  async obtenerPanel() {
    return this.repo.obtenerPanel();
  }
}
