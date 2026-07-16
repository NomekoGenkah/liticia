import { describe, it, expect, vi } from "vitest";
import { PerfilEmpresaService } from "./perfilEmpresaService";

const perfilInput = {
  tipo: "EMPRESA" as const,
  nombre: "Servicios Climáticos SpA",
  descripcion: "Empresa de mantención de climatización.",
  rubro: "Climatización",
  palabrasClave: ["climatización"],
  categoriasUnspsc: ["72101507"],
  regionesInteres: ["Metropolitana"],
  montoMinimo: 5000000,
  montoMaximo: 50000000,
};

function buildService() {
  const perfilEmpresaRepo = { obtener: vi.fn(), guardar: vi.fn() };
  const service = new PerfilEmpresaService(perfilEmpresaRepo as never);
  return { service, perfilEmpresaRepo };
}

describe("PerfilEmpresaService.obtener", () => {
  it("lanza NotFoundError (PERFIL_EMPRESA_NO_CONFIGURADO) si no hay perfil creado", async () => {
    const { service, perfilEmpresaRepo } = buildService();
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(null);

    await expect(service.obtener()).rejects.toMatchObject({
      code: "PERFIL_EMPRESA_NO_CONFIGURADO",
      statusCode: 404,
    });
  });

  it("devuelve el perfil si existe", async () => {
    const { service, perfilEmpresaRepo } = buildService();
    const perfil = { id: "perfil-1", ...perfilInput, version: 1 };
    perfilEmpresaRepo.obtener.mockResolvedValueOnce(perfil);

    await expect(service.obtener()).resolves.toEqual(perfil);
  });
});

describe("PerfilEmpresaService.guardar", () => {
  it("delega al repositorio", async () => {
    const { service, perfilEmpresaRepo } = buildService();
    const perfilGuardado = { id: "perfil-1", ...perfilInput, version: 1 };
    perfilEmpresaRepo.guardar.mockResolvedValueOnce(perfilGuardado);

    const resultado = await service.guardar(perfilInput);

    expect(perfilEmpresaRepo.guardar).toHaveBeenCalledWith(perfilInput);
    expect(resultado).toEqual(perfilGuardado);
  });
});
