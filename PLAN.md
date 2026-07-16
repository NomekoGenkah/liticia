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
| 2 | Scheduling + botón manual | Hecho |
| 3 | IA: resumen y extracción por licitación | Hecho |
| 4 | Perfil de empresa + matching con IA | Hecho |
| 5 | Frontend completo | Pendiente |
| 6 | RAG (opcional, a confirmar antes de iniciar) | Pendiente |

## Fase 1 — Ingesta base (alcance)

1. `ChileCompraClient` con dos métodos separados: `search(filtros)` (listado básico por fecha/estado/organismo/proveedor) y `getDetail(codigo)` (ficha completa, ignora fecha). Retry/backoff + contador de requests diarias contra el límite de 10.000/ticket.
2. Job de ingesta (invocable manualmente vía script npm; el scheduler real es Fase 2): por cada fecha/estado, `search()` → por cada `CodigoExterno` nuevo o con `CodigoEstado` cambiado respecto al guardado, `getDetail()` → upsert en Postgres. Guarda el JSON crudo en `jsonb`.
3. Endpoints REST: listar licitaciones guardadas (paginado, filtros básicos) y detalle por `codigoExterno`.

Sin IA, sin scraping de documentos (ver decisión arriba). Detalle completo del diseño en el plan de la sesión (`/home/genkah/.claude/plans/licitia-prompt-sorted-tower.md`).

## Fase 3 — IA: resumen y extracción por licitación (alcance)

Para cada `Licitacion` guardada, se genera con un LLM local (Ollama, `OllamaClient` en `clients/`) un resumen ejecutivo y una extracción estructurada (`puntosClave`, `palabrasClave`, `nivelComplejidad`), guardados 1:1 en `LicitacionAnalisis`. Es insumo directo para el matching contra perfil de empresa de la Fase 4, pero esta fase no compara nada contra un perfil — es análisis puro por licitación.

**Misma restricción que la Fase 1**: no hay texto de documentos/anexos disponible (la descarga automática sigue descartada por reCAPTCHA Enterprise, sin resolver aún). El único input del LLM es lo que ya vive en `Licitacion`/`LicitacionItem` — `nombre`, `descripcion` (el campo de texto libre principal), organismo, monto, tipo, fechas e ítems.

1. `OllamaClient.generarAnalisis()`: llama a `chat()` del paquete oficial `ollama` con `format` como JSON schema (no el literal `'json'`) y `think` configurable (`OLLAMA_THINK`, default `false`, para mitigar el bloque `<think>...</think>` que modelos como qwen3 pueden emitir). El parseo de la respuesta es defensivo (quita `<think>`/fences de Markdown antes de `JSON.parse` + validación con zod), ya que `think: false` no está garantizado en todas las combinaciones de versión de Ollama/modelo.
2. Disparo manual únicamente, sin auto-wiring al scheduler de cron: `POST /api/licitaciones/:codigoExterno/analisis` (individual, sin restricción de estado) y `POST /api/analisis/pendientes` (batch asíncrono — 202 + polling vía `GET /api/analisis/estado` — porque las llamadas al LLM local son mucho más lentas que las de ChileCompra) + `npm run analyze` (CLI, forma síncrona primaria de correr el batch completo).
3. El batch de "pendientes" solo cubre licitaciones activas (`estado = "Publicada"`) sin análisis vigente o con último intento `FALLIDO` — reintenta fallidos sin límite por ahora.

Detalle completo del diseño en el plan de la sesión (`/home/genkah/.claude/plans/lee-plan-md-y-planifica-effervescent-manatee.md`).

## Fase 4 — Perfil de empresa + matching con IA (alcance)

El usuario (mono-usuario, app 100% local) declara un único perfil de empresa (`PerfilEmpresa`, tabla singleton) con qué hace y qué le interesa (rubro, palabras clave, categorías UNSPSC, regiones, rango de monto). Para cada licitación con `LicitacionAnalisis` ya `COMPLETADO`, se genera con el mismo LLM local un veredicto de "¿le conviene postular?" (`puntaje` 0-100, `recomendacion` `SI`/`NO`/`TAL_VEZ`, `justificacion`), guardado 1:1 en `LicitacionMatching` — como el perfil es singleton, no hace falta una tabla de unión.

**Dependencia dura con la Fase 3**: el matching parte del `resumenEjecutivo`/`puntosClave`/`palabrasClave`/`nivelComplejidad` ya generado por el análisis, no repite esa extracción — una licitación sin análisis completado no se puede matchear (`422 ANALISIS_REQUERIDO`), y el batch de "pendientes" solo cubre activas que YA tienen análisis completado (no encadena análisis + matching automáticamente).

1. Disparo manual, mismo patrón que Fase 3: `POST /api/licitaciones/:codigoExterno/matching` (individual) y `POST /api/matching/pendientes` (batch asíncrono, 202 + polling vía `GET /api/matching/estado`) + `npm run match` (CLI, forma síncrona primaria).
2. `PerfilEmpresa` lleva un campo `version` que se incrementa en cada `PUT /api/perfil-empresa`; cada `LicitacionMatching` guarda el `perfilVersion` con el que fue calculado. Esto invalida (sin borrar) los matches calculados contra un perfil viejo — vuelven a aparecer como "pendientes" cuando el perfil cambia.
3. `GET`/`PUT /api/perfil-empresa` para leer/crear-actualizar el perfil (404 `PERFIL_EMPRESA_NO_CONFIGURADO` si aún no existe).

Detalle completo del diseño en el plan de la sesión (`/home/genkah/.claude/plans/lee-plan-md-y-planea-steady-turtle.md`).
