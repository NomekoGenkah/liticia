# LicitIA — Plan de Implementación

## Arquitectura general

Node.js 22 + TypeScript + Express, en capas estrictas:

```
routes (controladores delgados, sin lógica)
  → services (toda la lógica de negocio)
    → repositories (acceso a datos vía Prisma)
    → clients (integraciones externas: ChileCompraClient, OllamaClient)
```

Regla dura: los `clients` nunca contienen lógica de negocio, solo hablan con el mundo externo (HTTP) y devuelven datos tipados. Los `routes` nunca hablan directo con Prisma ni con clients — siempre pasan por un `service`.

- **Base de datos**: PostgreSQL 16 (Docker), Prisma como ORM. `codigoExterno` es la clave de deduplicación de licitaciones. El `rawResponse` completo de cada detalle se guarda en una columna `jsonb`, porque la propia ChileCompra advierte que puede cambiar el esquema de su API sin aviso.
- **Logging**: pino, structured JSON, sink a `storage/logs`.
- **LLM**: Ollama corriendo en el host (no dockerizado), consumido vía el paquete oficial `ollama` (npm) desde el backend — recién se usa a partir de la Fase 3.
- **Scheduler**: `node-cron` (modo `cron`) o `setInterval` (modo `interval`), configurable por `.env` sin tocar código — se implementa en la Fase 2.
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Router — se implementa en la Fase 5.

### Decisión de arquitectura registrada — Fase 1: sin descarga automática de documentos

Se investigó el flujo real de la ficha pública de una licitación en mercadopublico.cl. La lista de anexos/documentos adjuntos está protegida por **Google reCAPTCHA Enterprise** (verificación por score que requiere ejecutar JS de Google y validar un token del lado del servidor). Un cliente HTTP simple no puede pasar esa verificación, y automatizar su evasión con un navegador headless no es algo que se vaya a construir en este proyecto (no es confiable a mediano plazo y roza el ToS del sitio).

**Consecuencia**: la Fase 1 no incluye `FichaScraperClient`, descarga de PDFs/DOCX ni extracción de texto. En su lugar, cada licitación guarda `urlFichaPublica` (construida directamente desde `codigoExterno`, sin scraping) para que el usuario abra la ficha real y descargue los anexos manualmente cuando quiera postular. La estrategia de adquisición de documentos para que la IA los pueda analizar (Fase 3) — ya sea navegador semi-asistido con el usuario resolviendo el captcha, o carga manual de PDFs — queda pendiente de decidir en una fase futura, no se diseña por adelantado.

## Tabla de fases

| Fase | Nombre | Estado |
|---|---|---|
| 1 | Ingesta base | Hecho |
| 2 | Scheduling + botón manual | Pendiente |
| 3 | IA: resumen y extracción por licitación | Pendiente |
| 4 | Perfil de empresa + matching con IA | Pendiente |
| 5 | Frontend completo | Pendiente |
| 6 | RAG (opcional, a confirmar antes de iniciar) | Pendiente |

## Fase 1 — Ingesta base (alcance)

1. `ChileCompraClient` con dos métodos separados: `search(filtros)` (listado básico por fecha/estado/organismo/proveedor) y `getDetail(codigo)` (ficha completa, ignora fecha). Retry/backoff + contador de requests diarias contra el límite de 10.000/ticket.
2. Job de ingesta (invocable manualmente vía script npm; el scheduler real es Fase 2): por cada fecha/estado, `search()` → por cada `CodigoExterno` nuevo o con `CodigoEstado` cambiado respecto al guardado, `getDetail()` → upsert en Postgres. Guarda el JSON crudo en `jsonb`.
3. Endpoints REST: listar licitaciones guardadas (paginado, filtros básicos) y detalle por `codigoExterno`.

Sin IA, sin scraping de documentos (ver decisión arriba). Detalle completo del diseño en el plan de la sesión (`/home/genkah/.claude/plans/licitia-prompt-sorted-tower.md`).
