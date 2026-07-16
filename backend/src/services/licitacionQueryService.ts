import type { licitacionRepository, LicitacionFiltros, OrderBy } from "../repositories/licitacionRepository";
import { NotFoundError } from "../utils/errors";
import { buildPaginationMeta, toSkipTake, type Pagination } from "../utils/pagination";

const ORDER_BY_WHITELIST = ["fechaPublicacion", "fechaCierre", "montoEstimado"] as const;

export function parseOrderBy(raw: string | undefined): OrderBy {
  if (!raw) return { field: "fechaPublicacion", direction: "desc" };

  const [field, direction] = raw.split(":");
  const isValidField = (ORDER_BY_WHITELIST as readonly string[]).includes(field ?? "");
  const isValidDirection = direction === "asc" || direction === "desc";

  return {
    field: isValidField ? (field as OrderBy["field"]) : "fechaPublicacion",
    direction: isValidDirection ? direction : "desc",
  };
}

export class LicitacionQueryService {
  constructor(private readonly repo: typeof licitacionRepository) {}

  async listar(filtros: LicitacionFiltros, orderBy: OrderBy, pagination: Pagination) {
    const { skip, take } = toSkipTake(pagination);
    const { data, total } = await this.repo.findMany(filtros, orderBy, skip, take);
    return { data, pagination: buildPaginationMeta(pagination, total) };
  }

  async obtenerDetalle(codigoExterno: string, includeRaw: boolean) {
    const licitacion = await this.repo.findByCodigoExterno(codigoExterno, includeRaw);
    if (!licitacion) throw new NotFoundError(`No existe la licitación ${codigoExterno}`);
    return licitacion;
  }
}
