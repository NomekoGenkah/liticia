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

**Resuelto en la Fase 6**: se descartó explícitamente automatizar o asistir la resolución del captcha (habría revertido esta decisión) y también un servicio de resolución de captcha de terceros (evasión de un mecanismo antibot, además de romper el ToS del sitio). Se eligió carga manual — el usuario descarga los anexos como cualquier persona y los sube a LicitIA.

## Tabla de fases

| Fase | Nombre | Estado |
|---|---|---|
| 1 | Ingesta base | Hecho |
| 2 | Scheduling + botón manual | Hecho |
| 3 | IA: resumen y extracción por licitación | Hecho |
| 4 | Perfil de empresa + matching con IA | Hecho |
| 5 | Frontend completo | Hecho |
| 6 | Ingesta de documentos (carga manual) | Hecho |
| 7 | RAG: preguntas y respuestas sobre documentos | Pendiente |

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

## Fase 5 — Frontend completo (alcance)

`frontend/` (React + Vite + TS + Tailwind + shadcn/ui, primitivas `@base-ui/react` + TanStack Query + React Router), servido en dev con `npm run dev` (puerto 5173, proxy `/api` → backend) o vía `docker compose up frontend`. Cuatro páginas: listado de licitaciones con filtros (estado, organismo, recomendación IA, orden) y tabla con badge de análisis/matching por fila; detalle de licitación (datos generales, ítems, tarjetas de análisis y matching con botón para generarlos, visor de JSON crudo); perfil de empresa (formulario, maneja el 404 `PERFIL_EMPRESA_NO_CONFIGURADO`); procesos (disparo manual de ingesta + histórico de runs, y disparo de los batches de análisis/matching pendientes con polling de `GET .../estado`).

**Cambio de backend que habilitó esto**: `GET /api/licitaciones` ahora incluye un resumen de `analisis`/`matching` por licitación (antes solo lo traía el detalle) y suma el filtro `recomendacion` y el `orderBy=puntaje` — así la tabla principal no necesita un request por fila para mostrar el veredicto de matching.

Detalle completo del diseño en el plan de la sesión (`/home/genkah/.claude/plans/foamy-dazzling-stroustrup.md`).

## Fase 6 — Ingesta de documentos (carga manual) (alcance)

Resuelve la decisión que quedó pendiente en la Fase 1. Se descartaron dos caminos automatizados (navegador semi-asistido resolviendo el captcha, y un servicio de terceros para evadirlo) por revertir esa decisión y/o romper el ToS del sitio. El camino elegido es carga manual: el usuario descarga los anexos desde `urlFichaPublica` como cualquier persona y los sube a LicitIA — cero automatización adicional sobre mercadopublico.cl.

1. Modelo `LicitacionDocumento` (`licitacionId`, `nombreArchivo`, `mimeType`, `tamañoBytes`, `rutaAlmacenamiento`, `textoExtraido` nullable, `estadoExtraccion` `PENDIENTE`/`COMPLETADO`/`FALLIDO`, `detalleError`, `fechaCarga`). Archivos en disco bajo `storage/documentos/{licitacionId}/`, mismo patrón que `storage/logs/`.
2. `POST /api/licitaciones/:codigoExterno/documentos` (multipart vía `multer`, dependencia nueva) sube el archivo y extrae el texto en el mismo request — a diferencia de las Fases 3/4, no hace falta el patrón asíncrono 202+polling porque extraer texto no depende de un LLM y es rápido. Tipos permitidos: PDF (`pdf-parse`), DOCX (`mammoth`) y XLSX (`exceljs` o similar, extrayendo el contenido de las celdas como texto plano) — límite 20MB por archivo; otros tipos se rechazan en la subida.
3. `GET /api/licitaciones/:codigoExterno/documentos` (listado) y `DELETE .../documentos/:id` (borra archivo + registro).
4. Frontend: card "Documentos" en el detalle de licitación (junto a Análisis y Matching de la Fase 5) — dropzone, lista con badge de estado de extracción, botón eliminar.

Esta fase entrega valor por sí sola (texto extraído de los documentos, visible aunque no haya RAG todavía) y es el insumo obligatorio de la Fase 7.

Detalle completo del diseño en el plan de la sesión (`/home/genkah/.claude/plans/lee-plan-md-y-planifica-parsed-willow.md`).

## Fase 7 — RAG: preguntas y respuestas sobre documentos (alcance)

**Dependencia dura con la Fase 6**: solo opera sobre licitaciones con al menos un `LicitacionDocumento` con `textoExtraido`. Alcance elegido: preguntas y respuestas ancladas en los documentos de **una licitación puntual** — no un buscador semántico sobre todo el corpus (se discutió y se descartó deliberadamente para esta fase; si surge la necesidad más adelante se planifica aparte).

1. `LicitacionDocumentoChunk` (`documentoId`, `licitacionId` denormalizado, `contenido`, `chunkIndex`, `embedding vector(768)`, `generadoEn`). Requiere la extensión `pgvector`: cambia la imagen del servicio `postgres` en `docker-compose.yml` a `pgvector/pgvector:pg16` + migración `CREATE EXTENSION vector`. Prisma no tipa `vector(n)` nativamente — el campo se declara `Unsupported("vector(768)")` y la búsqueda por similitud se hace con `$queryRaw`.
2. Los documentos con `textoExtraido` se parten en chunks (~500-1000 tokens con solape) y cada chunk se embebe con `OllamaClient.generarEmbedding()`, usando `nomic-embed-text` (768 dimensiones) como modelo de embeddings por defecto — separado del modelo de chat, configurable vía `OLLAMA_EMBED_MODEL`.
3. Disparo manual, mismo patrón que Fases 3/4: `POST /api/documentos/pendientes` (batch asíncrono, 202 + polling vía `GET /api/documentos/estado`) + `npm run embed` (CLI) — procesa documentos con texto extraído que aún no tienen chunks.
4. `POST /api/licitaciones/:codigoExterno/preguntas` (`{ pregunta }`): embebe la pregunta, busca los k chunks más cercanos por similitud coseno acotado a esa licitación, arma un prompt con ese contexto + la pregunta y responde vía `ollamaClient.chat()`. La respuesta indica qué documentos/chunks se usaron como fuente.
5. Frontend: caja de chat en el detalle de licitación, visible solo cuando la licitación tiene al menos un documento con chunks generados.

Fuera de alcance de esta fase: búsqueda semántica global sobre todo el corpus (discutido, no elegido).
