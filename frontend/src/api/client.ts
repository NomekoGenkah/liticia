export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  searchParams?: object;
}

function buildQueryString(searchParams?: RequestOptions["searchParams"]): string {
  if (!searchParams) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}${buildQueryString(options.searchParams)}`, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => undefined);

  if (!response.ok) {
    const message = payload?.error?.message ?? `Error ${response.status} al llamar ${path}`;
    const code = payload?.error?.code ?? "UNKNOWN_ERROR";
    throw new ApiError(message, response.status, code);
  }

  return payload as T;
}
