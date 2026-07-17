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
| 7 | RAG: preguntas y respuestas sobre documentos | Hecho |
| 8 | UX de procesos IA: progreso en vivo, cancelación e historial | Hecho |

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

### Prefiltro por segmento UNSPSC (añadido después)

Los batches de pendientes de análisis y de matching solo procesan licitaciones con al menos un ítem del **segmento** UNSPSC (2 primeros dígitos) de alguna `categoriasUnspsc` del perfil. Sin perfil, o con un perfil sin categorías, procesan todo como antes. `analizarUna()`/`matchearUna()` no se ven afectados: el filtro solo decide a qué vale la pena gastarle LLM, y cualquier licitación puntual se puede seguir analizando a mano.

**Por qué segmento y no el código exacto**, medido sobre datos reales: el código clasifica bien lo lejano y mal lo cercano. "Servicio implementación Jira o similar mod Cloud" viene clasificado por el organismo como `43231500` ("paquetes de software para oficinas"), así que un filtro por código exacto contra un perfil de desarrollo la dejaría fuera — y en cambio dejaría pasar "Enlace de internet de alta velocidad", que comparte el código `83121700` con ese mismo perfil. Con el perfil real (8 códigos de desarrollo de software), de 266 activas: código exacto → 3 (pierde la de Jira, 2 de las 3 son conectividad), familia de 4 dígitos → 7, segmento → 28. El segmento descarta lo obviamente ajeno (neumáticos, vendajes, asfalto) y deja el juicio fino al LLM, que sí entiende que Jira es desarrollo.

**Por qué el filtro va acá y no en la ingesta**: el `search()` de ChileCompra solo devuelve `CodigoExterno`, `Nombre`, `CodigoEstado` y `FechaCierre` — los ítems con su categoría UNSPSC solo vienen en `getDetail()`. Para conocer el código ya hay que haber gastado el request del detalle, que es el recurso realmente escaso (límite diario por ticket); descartar la licitación después no lo devuelve. Guardarla cuesta ~21 KB (12 MB las 576) y es reversible; no guardarla es irreversible, porque la API solo permite volver a consultar por fecha. El costo real está en el LLM (~26 s por licitación), y ahí es donde el filtro corta.

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
5. Frontend: caja de chat en el detalle de licitación, visible solo cuando la licitación tiene al menos un documento con chunks generados. `GET /api/licitaciones/:codigoExterno` y el listado de documentos suman `chunksCount` por documento para poder decidirlo sin traerse los embeddings.

Fuera de alcance de esta fase: búsqueda semántica global sobre todo el corpus (discutido, no elegido).

### Decisiones resueltas al implementar

- **Historial persistido** en `LicitacionPregunta` (`pregunta`, `respuesta`, `fuentes` jsonb, `modelo`, `promptVersion`, `duracionMs`) + `GET /api/licitaciones/:codigoExterno/preguntas`: el chat sobrevive a recargas, coherente con que toda salida de LLM en la app se guarda con sus metadatos. Solo se persisten los intercambios exitosos — si el modelo falla, sale un 502 y no se escribe nada.
- **Sin streaming**: `POST` que espera y devuelve el JSON completo, igual que análisis/matching. Se puede añadir SSE después sin romper el contrato.
- **Embedding solo manual**, nunca automático al subir un documento: respeta la regla de las Fases 3/4/6 de que ningún LLM se dispara solo.
- **Sin índice vectorial (ni HNSW ni IVFFlat)**, y no por simplicidad: la búsqueda siempre filtra por `licitacionId`, y pgvector post-filtra — el índice buscaría los vecinos de todo el corpus y recién después descartaría los de otras licitaciones, pudiendo devolver cero resultados para la licitación consultada. El B-tree de `licitacionId` ya deja decenas de filas, sobre las que el scan exacto es correcto y sub-milisegundo. Revisar solo si aparece la búsqueda global (hoy fuera de alcance).
- **La respuesta se genera en texto plano, sin JSON schema** (a diferencia de análisis/matching): la salida es prosa, y una gramática obligaría al modelo a escapar cada comilla y salto de línea, tirando la generación entera por una string mal cerrada. Las **fuentes se derivan de la búsqueda por similitud, no de lo que diga el modelo**, así no puede citar documentos que nunca estuvieron en su contexto.
- **`num_ctx` explícito (`OLLAMA_RAG_NUM_CTX`, default 8192)**: Ollama trunca el prompt en silencio a `num_ctx` (default 4096) descartando los tokens más viejos. El prompt real medido con 5 fragmentos ronda los 5000 tokens, así que con el default se perdían el system prompt y los fragmentos más relevantes (van ordenados por similitud) — un chat que responde genérico o inventa sin un solo error en los logs. Por lo mismo `OLLAMA_RAG_TIMEOUT_MS` (180s) va aparte del timeout de análisis/matching.
- **La imagen de postgres es `pgvector/pgvector:pg16-trixie`, no `pg16` a secas**: el tag por defecto es bookworm (glibc 2.36) y la BD se creó con `postgres:16` (trixie, glibc 2.41). Bajar de glibc deja los índices B-tree de texto ordenados con reglas que ya no coinciden con las del motor ("collation version mismatch"), lo que puede romper búsquedas y el UNIQUE de `codigoExterno`. Con el tag trixie el volumen `pgdata` se reusa sin warnings ni REINDEX.
- Al cambiar el schema hay que correr `prisma generate` **dentro del contenedor** del backend: usa su propio `node_modules` (volumen anónimo), así que regenerarlo solo en el host deja al contenedor con el Client viejo.

Detalle completo del diseño en el plan de la sesión (`/home/genkah/.claude/plans/lee-plan-md-y-planifica-jaunty-wave.md`).

## Fase 8 — UX de procesos IA (alcance)

Hasta acá, disparar un batch de IA dejaba la interfaz muerta: el estado de cada proceso era un `let enProceso = false` a nivel de módulo, `GET /api/analisis/estado` devolvía solo `{ enProceso }`, y el resumen del batch (que ya se calculaba) moría en un `logger.info`. No había forma de saber qué se estaba procesando, cuánto faltaba, ni de parar. Esta fase convierte eso en un proceso observable y controlable, sin cambiar qué hace la IA.

1. **`ProcesoRun` + `ProcesoRunItem`**: historial persistido de cada corrida de análisis/matching/embeddings, con la misma función que `IngestaRun` cumple para la ingesta — parámetros, disparador (`MANUAL`/`CLI`), modelo, contadores, estado y, por ítem, su duración y su error.
2. **`ProcesoRunner<TItem, TCtx>`** (`services/procesos/`): una sola abstracción con el lock, el `AbortController`, el loop, el estado en memoria, la persistencia y la emisión de eventos. Reemplaza a `analisisRunner`/`matchingRunner`/`embeddingRunner`, que eran copy-paste. Lo específico de cada tipo queda en una `DefinicionProceso` (`planificar()`, `describir()`, `procesar()`).
3. **Streaming y cancelación** en `OllamaClient`: `generarAnalisis`/`generarMatching` pasan a `stream: true` y aceptan `{ signal, onToken }`. `POST /api/procesos/:tipo/cancelar` aborta la request a Ollama en curso (corta en <1s, medido).
4. **SSE**: `GET /api/procesos/eventos` transmite progreso y los tokens del modelo a medida que salen. El frontend los vuelca al caché de TanStack Query desde una única conexión.
5. **Endpoints unificados** en `/api/procesos/:tipo` (`analisis`|`matching`|`embeddings`): `estado`, `pendientes` (vista previa), `ejecutar` (con `{ ids }` opcional), `cancelar`, `runs`. Los tres routers viejos (`/analisis`, `/matching`, `/documentos`) desaparecen.
6. **Frontend**: panel en vivo con barra, ETA, licitación actual, cronómetro, salida del modelo y botón de cancelar — compartido entre Procesos y el detalle de licitación. Historial de corridas con fila expandible. Checkboxes en el listado con barra de "Analizar/Matchear N seleccionadas". Vista previa de pendientes destildables antes de disparar.

### Decisiones resueltas al implementar

- **El streaming no es cosmético: es el único camino a la cancelación.** Verificado en `node_modules/ollama/dist/browser.mjs`: la librería crea un `AbortController` **solo** para requests con `stream: true` (`processStreamableRequest`) y pasa su signal al `fetch`; con `stream: false` no hay signal en absoluto. Encima, el `fetch` inyectado en el constructor de `OllamaClient` lo **pisaba** con su propio `AbortSignal.timeout`. Por eso ahora compone (`AbortSignal.any`) en vez de pisar, y por eso "ver el texto del modelo" y "poder cancelar" resultaron ser la misma implementación.
- **`OLLAMA_REQUEST_TIMEOUT_MS` cambia de significado para análisis/matching**: era un tope de pared de 60s sobre una generación que este plan mide en ~26s promedio, o sea que cortaba generaciones vivas solo por ser largas. Con streaming eso es medible, así que pasa a ser un watchdog de inactividad **entre tokens** (`OLLAMA_STREAM_IDLE_TIMEOUT_MS`), con `OLLAMA_STREAM_HARD_CAP_MS` como red de seguridad. Conserva su significado exacto para embeddings y RAG, que no streamean.
- **Una cancelación no es un fallo.** El `catch` de `procesar()` persistía `guardarFallido()` para cualquier error; ahora deja pasar `ProcesoCanceladoError` sin escribir nada, para que la licitación vuelva a la cola en vez de quedar `FALLIDA` con un intento gastado y un `detalleError: "aborted"` indistinguible de un problema real. Por lo mismo, `withRetry` recibe `esRetryable`: sin eso, el botón "Cancelar" *iniciaba* dos generaciones más.
- **`ProcesoRun` unificado con `tipo`, sin absorber `IngestaRun`**: los tres serían columna por columna idénticos, y `tipo` es justo lo que la ruta `/api/procesos/:tipo` necesita. La ingesta queda aparte porque sus contadores son otros, incluye `CRON`, no es por-licitación, no habla con un LLM y no es cancelable; unificarlas obligaría a un `resumen Json` que destipa los contadores a cambio de nada. Por lo mismo la ingesta **no** migró al panel en vivo y conserva su polling de `{ enProceso }`.
- **`ProcesoRunItem` no es opcional**: los contadores solos no responden "¿cuáles fueron las 3 que fallaron?". `LicitacionAnalisis.detalleError` no sustituye (es 1:1, se pisa en el siguiente intento y no tiene vínculo con el run), y para embeddings no existe estado por documento.
- **SSE multiplexado en un solo endpoint**, no uno por tipo: el navegador admite 6 conexiones HTTP/1.1 por origen y los tres paneles conviven en la misma pantalla. Con un stream por tipo, la mitad del presupuesto se iría en conexiones que no terminan nunca y las queries normales harían cola detrás. **Sin `Last-Event-ID`**: los tokens son efímeros y el snapshot que se manda al conectar ya trae la verdad completa.
- **Los eventos de ítem llevan contadores acumulados, no deltas**, así una pestaña que se perdió un evento se auto-corrige en el siguiente sin necesidad de replay. Y los tokens van a una query aparte de la del estado: llegan ~10 veces por segundo (agrupados de a 100ms) y re-renderizarían la barra, los contadores y el cronómetro en cada uno.
- **El prefiltro UNSPSC NO se aplica en modo `IDS`.** Decide a qué vale la pena gastarle LLM cuando elige el sistema; cuando las elige el usuario, ya decidió. Aplicarlo haría que "analizar 5 seleccionadas" analice 2 sin explicación. Es la semántica que ya tenía `analizarUna()` y que fija la Fase 4.
- **`planificar()` corre antes de crear el run**, y eso arregla un bug real: `iniciarMatchingPendientes()` respondía 202 sin perfil de empresa y el `PERFIL_EMPRESA_REQUERIDO` moría en un `.catch` — el frontend decía "matching iniciado" y después nada.
- **`server.requestTimeout = 0`**: el default de Node (300s) corta cualquier request más larga, y el stream SSE dura lo que dure el batch (horas). Sin esto, el panel se congela a los 5 minutos exactos sin un solo error en los logs. Por lo mismo `app.ts` **no puede** tener `compression`: bufferearía el stream y lo congelaría igual de silenciosamente.
- **Barrido de runs huérfanos al arrancar** (`server.ts`, antes del `listen`): un `EN_PROCESO` en la base al arrancar solo puede ser un backend que murió a mitad. Se cierran como `INTERRUMPIDO`, que es distinto de `FALLIDO` a propósito — "el modelo falló" y "se cayó el backend" mandan a depurar a lugares distintos. Va **solo** en `server.ts` y nunca en los jobs del CLI: si `npm run analyze` barriera al arrancar, se llevaría puesto el run vivo del servidor.
- **El lock de memoria no cruza procesos**, y eso ya estaba roto: el CLI y el servidor tenían cada uno su propia copia de `let enProceso`. Ahora hay además un chequeo de `hayRunActivo(tipo)` en la base, que recién es posible porque existe la tabla. Y los jobs del CLI ganan `SIGINT → cancelar()`, así Ctrl+C cierra el run en vez de dejarlo huérfano.
- **`listarPendientesActivas` gana `orderBy: { fechaCierre: "asc" }`**: sin orden estable, "23 de 140" y el tiempo estimado no significan nada entre corridas. Y procesar primero lo que cierra antes es lo correcto para quien cancela a mitad.
- **`POST /api/licitaciones/:codigoExterno/{analisis,matching}` pasa de 200 síncrono a 202**: era el peor caso de todos (una request abierta minutos con un botón que decía "Generando…"). Ahora es un run de 1, con el mismo panel, cancelable y en el historial. Se conserva el path por `codigoExterno` porque el modelo mental del detalle es "analizar ESTA licitación"; traducirlo a id son tres líneas. De paso se habilita regenerar un análisis ya completado, que antes estaba prohibido (el botón desaparecía).
