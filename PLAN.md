# LicitIA — Implementation Plan

> This document is kept in English only (see the architecture decision *Domain code stays in Spanish* at the end). The domain identifiers in the code — `licitacion`, `codigoExterno`, `perfil` — stay in Spanish on purpose.

## General architecture

Node.js 22 + TypeScript + Express, in strict layers:

```
routes (thin controllers, no logic)
  → services (all the business logic)
    → repositories (data access via Prisma)
    → clients (external integrations: ChileCompraClient, OllamaClient)
```

Hard rule: `clients` never contain business logic, they only talk to the outside world (HTTP) and return typed data. `routes` never talk to Prisma or clients directly — they always go through a `service`.

- **Database**: PostgreSQL 16 (Docker), Prisma as the ORM. `codigoExterno` is the deduplication key for tenders. The full `rawResponse` of each detail is stored in a `jsonb` column, because ChileCompra itself warns that it may change its API schema without notice.
- **Logging**: pino, structured JSON, sink to `storage/logs`.
- **LLM**: Ollama running on the host (not dockerized), consumed via the official `ollama` npm package from the backend — first used from Phase 3 on.
- **Scheduler**: `node-cron` (`cron` mode) or `setInterval` (`interval` mode), configurable via `.env` without touching code — implemented in Phase 2.
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Router — implemented in Phase 5.

### Recorded architecture decision — Phase 1: no automatic document download

The real flow of a tender's public listing on mercadopublico.cl was investigated. The list of attachments/documents is protected by **Google reCAPTCHA Enterprise** (score-based verification that requires running Google's JS and validating a server-side token). A simple HTTP client cannot pass that verification, and automating its evasion with a headless browser is not something this project will build (it is not reliable in the medium term and brushes against the site's ToS).

**Consequence**: Phase 1 does not include a `FichaScraperClient`, PDF/DOCX download or text extraction. Instead, each tender stores `urlFichaPublica` (built directly from `codigoExterno`, no scraping) so the user can open the real listing and download the attachments manually when they want to bid. The document acquisition strategy so the AI can analyze them (Phase 3) — whether a semi-assisted browser with the user solving the captcha, or manual PDF upload — is left to be decided in a future phase, not designed ahead of time.

**Resolved in Phase 6**: automating or assisting the captcha solution was explicitly discarded (it would have reverted this decision), and so was a third-party captcha-solving service (evading an anti-bot mechanism, plus breaking the site's ToS). Manual upload was chosen — the user downloads the attachments like any person and uploads them to LicitIA.

## Phase table

| Phase | Name | Status |
|---|---|---|
| 1 | Base ingestion | Done |
| 2 | Scheduling + manual button | Done |
| 3 | AI: per-tender summary and extraction | Done |
| 4 | Company profile + AI matching | Done |
| 5 | Full frontend | Done |
| 6 | Document ingestion (manual upload) | Done |
| 7 | RAG: questions and answers over documents | Done |
| 8 | AI process UX: live progress, cancellation and history | Done |

## Phase 1 — Base ingestion (scope)

1. `ChileCompraClient` with two separate methods: `search(filtros)` (basic listing by date/status/organization/supplier) and `getDetail(codigo)` (full detail, ignores date). Retry/backoff + a counter of daily requests against the 10,000/ticket limit.
2. Ingestion job (invocable manually via an npm script; the real scheduler is Phase 2): for each date/status, `search()` → for each `CodigoExterno` that is new or whose `CodigoEstado` changed relative to the stored one, `getDetail()` → upsert into Postgres. Stores the raw JSON in `jsonb`.
3. REST endpoints: list stored tenders (paginated, basic filters) and detail by `codigoExterno`.

No AI, no document scraping (see the decision above). Full design detail in the session plan (`/home/genkah/.claude/plans/licitia-prompt-sorted-tower.md`).

## Phase 3 — AI: per-tender summary and extraction (scope)

For each stored `Licitacion`, a local LLM (Ollama, `OllamaClient` in `clients/`) generates an executive summary and a structured extraction (`puntosClave`, `palabrasClave`, `nivelComplejidad`), stored 1:1 in `LicitacionAnalisis`. It is direct input for the Phase 4 matching against the company profile, but this phase compares nothing against a profile — it is pure per-tender analysis.

**Same restriction as Phase 1**: there is no document/attachment text available (automatic download is still discarded due to reCAPTCHA Enterprise, still unresolved). The only LLM input is what already lives in `Licitacion`/`LicitacionItem` — `nombre`, `descripcion` (the main free-text field), organization, amount, type, dates and items.

1. `OllamaClient.generarAnalisis()`: calls the official `ollama` package's `chat()` with `format` as a JSON schema (not the literal `'json'`) and configurable `think` (`OLLAMA_THINK`, default `false`, to mitigate the `<think>...</think>` block that models like qwen3 may emit). Response parsing is defensive (strips `<think>`/Markdown fences before `JSON.parse` + zod validation), since `think: false` is not guaranteed across all Ollama/model version combinations.
2. Manual trigger only, no auto-wiring to the cron scheduler: `POST /api/licitaciones/:codigoExterno/analisis` (individual, no status restriction) and `POST /api/analisis/pendientes` (async batch — 202 + polling via `GET /api/analisis/estado` — because local LLM calls are much slower than ChileCompra's) + `npm run analyze` (CLI, the primary synchronous way to run the full batch).
3. The "pending" batch only covers active tenders (`estado = "Publicada"`) with no valid analysis or with a `FALLIDO` last attempt — retries failures without a limit for now.

Full design detail in the session plan (`/home/genkah/.claude/plans/lee-plan-md-y-planifica-effervescent-manatee.md`).

## Phase 4 — Company profile + AI matching (scope)

The user (single-user, 100% local app) declares a single company profile (`PerfilEmpresa`, singleton table) with what they do and what interests them (line of business, keywords, UNSPSC categories, regions, amount range). For each tender whose `LicitacionAnalisis` is already `COMPLETADO`, the same local LLM generates a "should I bid?" verdict (`puntaje` 0–100, `recomendacion` `SI`/`NO`/`TAL_VEZ`, `justificacion`), stored 1:1 in `LicitacionMatching` — since the profile is a singleton, no join table is needed.

**Hard dependency on Phase 3**: matching starts from the `resumenEjecutivo`/`puntosClave`/`palabrasClave`/`nivelComplejidad` already generated by the analysis, it does not repeat that extraction — a tender without completed analysis cannot be matched (`422 ANALISIS_REQUERIDO`), and the "pending" batch only covers active tenders that ALREADY have completed analysis (it does not chain analysis + matching automatically).

1. Manual trigger, same pattern as Phase 3: `POST /api/licitaciones/:codigoExterno/matching` (individual) and `POST /api/matching/pendientes` (async batch, 202 + polling via `GET /api/matching/estado`) + `npm run match` (CLI, the primary synchronous way).
2. `PerfilEmpresa` carries a `version` field that increments on each `PUT /api/perfil-empresa`; each `LicitacionMatching` stores the `perfilVersion` it was computed with. This invalidates (without deleting) matches computed against an old profile — they reappear as "pending" when the profile changes.
3. `GET`/`PUT /api/perfil-empresa` to read/create-update the profile (404 `PERFIL_EMPRESA_NO_CONFIGURADO` if it doesn't exist yet).

### UNSPSC segment prefilter (added later)

The pending batches for analysis and matching only process tenders with at least one item in the UNSPSC **segment** (first 2 digits) of some `categoriasUnspsc` in the profile. With no profile, or with a profile that has no categories, they process everything as before. `analizarUna()`/`matchearUna()` are unaffected: the filter only decides what is worth spending LLM on, and any single tender can still be analyzed by hand.

**Why segment and not the exact code**, measured on real data: the code classifies distant things well and close things poorly. "Servicio implementación Jira o similar mod Cloud" is classified by the organization as `43231500` ("office software packages"), so an exact-code filter against a software-development profile would leave it out — and would instead let "high-speed internet link" through, which shares the code `83121700` with that same profile. With the real profile (8 software-development codes), out of 266 active tenders: exact code → 3 (loses the Jira one, 2 of the 3 are connectivity), 4-digit family → 7, segment → 28. The segment discards the obviously unrelated (tires, bandages, asphalt) and leaves the fine judgment to the LLM, which does understand that Jira is development.

**Why the filter goes here and not in ingestion**: ChileCompra's `search()` only returns `CodigoExterno`, `Nombre`, `CodigoEstado` and `FechaCierre` — the items with their UNSPSC category only come in `getDetail()`. To know the code you already have to have spent the detail request, which is the truly scarce resource (daily per-ticket limit); discarding the tender afterwards does not give it back. Storing it costs ~21 KB (12 MB for all 576) and is reversible; not storing it is irreversible, because the API only allows re-querying by date. The real cost is in the LLM (~26 s per tender), and that is where the filter cuts.

Full design detail in the session plan (`/home/genkah/.claude/plans/lee-plan-md-y-planea-steady-turtle.md`).

## Phase 5 — Full frontend (scope)

`frontend/` (React + Vite + TS + Tailwind + shadcn/ui, `@base-ui/react` primitives + TanStack Query + React Router), served in dev with `npm run dev` (port 5173, `/api` proxy → backend) or via `docker compose up frontend`. Four pages: tender list with filters (status, organization, AI recommendation, order) and a table with an analysis/matching badge per row; tender detail (general data, items, analysis and matching cards with a button to generate them, raw JSON viewer); company profile (form, handles the 404 `PERFIL_EMPRESA_NO_CONFIGURADO`); processes (manual ingestion trigger + run history, and triggering the analysis/matching pending batches with polling of `GET .../estado`).

**Backend change that enabled this**: `GET /api/licitaciones` now includes an `analisis`/`matching` summary per tender (previously only the detail carried it) and adds the `recomendacion` filter and `orderBy=puntaje` — so the main table doesn't need a request per row to show the matching verdict.

Full design detail in the session plan (`/home/genkah/.claude/plans/foamy-dazzling-stroustrup.md`).

## Phase 6 — Document ingestion (manual upload) (scope)

Resolves the decision left pending in Phase 1. Two automated paths were discarded (a semi-assisted browser solving the captcha, and a third-party service to evade it) for reverting that decision and/or breaking the site's ToS. The chosen path is manual upload: the user downloads the attachments from `urlFichaPublica` like any person and uploads them to LicitIA — zero additional automation over mercadopublico.cl.

1. `LicitacionDocumento` model (`licitacionId`, `nombreArchivo`, `mimeType`, `tamañoBytes`, `rutaAlmacenamiento`, `textoExtraido` nullable, `estadoExtraccion` `PENDIENTE`/`COMPLETADO`/`FALLIDO`, `detalleError`, `fechaCarga`). Files on disk under `storage/documentos/{licitacionId}/`, same pattern as `storage/logs/`.
2. `POST /api/licitaciones/:codigoExterno/documentos` (multipart via `multer`, a new dependency) uploads the file and extracts the text in the same request — unlike Phases 3/4, the async 202+polling pattern is not needed because text extraction doesn't depend on an LLM and is fast. Allowed types: PDF (`pdf-parse`), DOCX (`mammoth`) and XLSX (`exceljs` or similar, extracting cell contents as plain text) — 20MB per-file limit; other types are rejected on upload.
3. `GET /api/licitaciones/:codigoExterno/documentos` (listing) and `DELETE .../documentos/:id` (deletes file + record).
4. Frontend: a "Documentos" card in the tender detail (next to Phase 5's Analysis and Matching) — dropzone, list with an extraction-status badge, delete button.

This phase delivers value on its own (extracted document text, visible even without RAG yet) and is the mandatory input for Phase 7.

Full design detail in the session plan (`/home/genkah/.claude/plans/lee-plan-md-y-planifica-parsed-willow.md`).

## Phase 7 — RAG: questions and answers over documents (scope)

**Hard dependency on Phase 6**: it only operates on tenders with at least one `LicitacionDocumento` that has `textoExtraido`. Chosen scope: questions and answers anchored in the documents of **a single tender** — not a semantic search over the whole corpus (this was discussed and deliberately discarded for this phase; if the need arises later it's planned separately).

1. `LicitacionDocumentoChunk` (`documentoId`, `licitacionId` denormalized, `contenido`, `chunkIndex`, `embedding vector(768)`, `generadoEn`). Requires the `pgvector` extension: changes the `postgres` service image in `docker-compose.yml` to `pgvector/pgvector:pg16` + a `CREATE EXTENSION vector` migration. Prisma doesn't type `vector(n)` natively — the field is declared `Unsupported("vector(768)")` and the similarity search is done with `$queryRaw`.
2. Documents with `textoExtraido` are split into chunks (~500–1000 tokens with overlap) and each chunk is embedded with `OllamaClient.generarEmbedding()`, using `nomic-embed-text` (768 dimensions) as the default embedding model — separate from the chat model, configurable via `OLLAMA_EMBED_MODEL`.
3. Manual trigger, same pattern as Phases 3/4: `POST /api/documentos/pendientes` (async batch, 202 + polling via `GET /api/documentos/estado`) + `npm run embed` (CLI) — processes documents with extracted text that don't have chunks yet.
4. `POST /api/licitaciones/:codigoExterno/preguntas` (`{ pregunta }`): embeds the question, finds the k nearest chunks by cosine similarity scoped to that tender, builds a prompt with that context + the question, and answers via `ollamaClient.chat()`. The answer states which documents/chunks were used as sources.
5. Frontend: a chat box in the tender detail, visible only when the tender has at least one document with chunks generated. `GET /api/licitaciones/:codigoExterno` and the document listing add `chunksCount` per document so this can be decided without fetching the embeddings.

Out of scope for this phase: global semantic search over the whole corpus (discussed, not chosen).

### Decisions resolved while implementing

- **Persisted history** in `LicitacionPregunta` (`pregunta`, `respuesta`, `fuentes` jsonb, `modelo`, `promptVersion`, `duracionMs`) + `GET /api/licitaciones/:codigoExterno/preguntas`: the chat survives reloads, consistent with the fact that every LLM output in the app is stored with its metadata. Only successful exchanges are persisted — if the model fails, a 502 comes out and nothing is written.
- **No streaming**: a `POST` that waits and returns the full JSON, just like analysis/matching. SSE can be added later without breaking the contract.
- **Embedding only manual**, never automatic on document upload: it respects the Phase 3/4/6 rule that no LLM ever fires on its own.
- **No vector index (neither HNSW nor IVFFlat)**, and not for simplicity: the search always filters by `licitacionId`, and pgvector post-filters — the index would look for the neighbors of the whole corpus and only then discard those from other tenders, potentially returning zero results for the queried tender. The `licitacionId` B-tree already leaves a few dozen rows, over which the exact scan is correct and sub-millisecond. Revisit only if global search appears (out of scope today).
- **The answer is generated as plain text, no JSON schema** (unlike analysis/matching): the output is prose, and a grammar would force the model to escape every quote and newline, sinking the whole generation over a badly closed string. The **sources are derived from the similarity search, not from what the model says**, so it can't cite documents that were never in its context.
- **Explicit `num_ctx` (`OLLAMA_RAG_NUM_CTX`, default 8192)**: Ollama silently truncates the prompt to `num_ctx` (default 4096), dropping the oldest tokens. The real measured prompt with 5 fragments is around 5000 tokens, so with the default it lost the system prompt and the most relevant fragments (they go ordered by similarity) — a chat that answers generically or makes things up without a single error in the logs. For the same reason `OLLAMA_RAG_TIMEOUT_MS` (180s) is separate from the analysis/matching timeout.
- **The postgres image is `pgvector/pgvector:pg16-trixie`, not plain `pg16`**: the default tag is bookworm (glibc 2.36) and the DB was created with `postgres:16` (trixie, glibc 2.41). Going down in glibc leaves the text B-tree indexes sorted with rules that no longer match the engine's ("collation version mismatch"), which can break searches and the `codigoExterno` UNIQUE. With the trixie tag the `pgdata` volume is reused with no warnings or REINDEX.
- On schema changes you must run `prisma generate` **inside the backend container**: it uses its own `node_modules` (anonymous volume), so regenerating it only on the host leaves the container with the old Client.

Full design detail in the session plan (`/home/genkah/.claude/plans/lee-plan-md-y-planifica-jaunty-wave.md`).

## Phase 8 — AI process UX (scope)

Until here, triggering an AI batch left the interface dead: each process's state was a module-level `let enProceso = false`, `GET /api/analisis/estado` returned only `{ enProceso }`, and the batch summary (already computed) died in a `logger.info`. There was no way to know what was being processed, how much was left, or to stop. This phase turns that into an observable, controllable process, without changing what the AI does.

1. **`ProcesoRun` + `ProcesoRunItem`**: persisted history of each analysis/matching/embeddings run, with the same role `IngestaRun` plays for ingestion — parameters, trigger (`MANUAL`/`CLI`), model, counters, status and, per item, its duration and error.
2. **`ProcesoRunner<TItem, TCtx>`** (`services/procesos/`): a single abstraction with the lock, the `AbortController`, the loop, the in-memory state, the persistence and the event emission. It replaces `analisisRunner`/`matchingRunner`/`embeddingRunner`, which were copy-paste. What's specific to each type lives in a `DefinicionProceso` (`planificar()`, `describir()`, `procesar()`).
3. **Streaming and cancellation** in `OllamaClient`: `generarAnalisis`/`generarMatching` switch to `stream: true` and accept `{ signal, onToken }`. `POST /api/procesos/:tipo/cancelar` aborts the in-flight Ollama request (cuts in <1s, measured).
4. **SSE**: `GET /api/procesos/eventos` streams progress and the model's tokens as they come out. The frontend dumps them into the TanStack Query cache from a single connection.
5. **Unified endpoints** under `/api/procesos/:tipo` (`analisis`|`matching`|`embeddings`): `estado`, `pendientes` (preview), `ejecutar` (with optional `{ ids }`), `cancelar`, `runs`. The three old routers (`/analisis`, `/matching`, `/documentos`) disappear.
6. **Frontend**: a live panel with a bar, ETA, current tender, stopwatch, model output and a cancel button — shared between Procesos and the tender detail. Run history with an expandable row. Checkboxes in the listing with an "Analyze/Match N selected" bar. Preview of pending items, deselectable before triggering.

### Decisions resolved while implementing

- **Streaming is not cosmetic: it is the only path to cancellation.** Verified in `node_modules/ollama/dist/browser.mjs`: the library creates an `AbortController` **only** for requests with `stream: true` (`processStreamableRequest`) and passes its signal to `fetch`; with `stream: false` there is no signal at all. On top of that, the `fetch` injected in the `OllamaClient` constructor **overrode** it with its own `AbortSignal.timeout`. So now it composes (`AbortSignal.any`) instead of overriding, and that's why "see the model's text" and "be able to cancel" turned out to be the same implementation.
- **`OLLAMA_REQUEST_TIMEOUT_MS` changes meaning for analysis/matching**: it was a 60s wall cap on a generation this plan measures at ~26s average, i.e. it cut live generations just for being long. With streaming that is measurable, so it becomes an inactivity watchdog **between tokens** (`OLLAMA_STREAM_IDLE_TIMEOUT_MS`), with `OLLAMA_STREAM_HARD_CAP_MS` as a safety net. It keeps its exact meaning for embeddings and RAG, which don't stream.
- **A cancellation is not a failure.** The `procesar()` `catch` persisted `guardarFallido()` for any error; now it lets `ProcesoCanceladoError` through without writing anything, so the tender returns to the queue instead of being left `FALLIDA` with a spent attempt and a `detalleError: "aborted"` indistinguishable from a real problem. For the same reason, `withRetry` receives `esRetryable`: without it, the "Cancel" button *started* two more generations.
- **`ProcesoRun` unified with `tipo`, without absorbing `IngestaRun`**: the three would be column-for-column identical, and `tipo` is exactly what the `/api/procesos/:tipo` route needs. Ingestion stays separate because its counters are different, it includes `CRON`, it is not per-tender, it doesn't talk to an LLM and it is not cancelable; unifying them would force a `resumen Json` that un-types the counters in exchange for nothing. For the same reason ingestion **did not** migrate to the live panel and keeps its `{ enProceso }` polling.
- **`ProcesoRunItem` is not optional**: the counters alone don't answer "which were the 3 that failed?". `LicitacionAnalisis.detalleError` is no substitute (it's 1:1, overwritten on the next attempt and has no link to the run), and for embeddings there is no per-document state.
- **SSE multiplexed on a single endpoint**, not one per type: the browser allows 6 HTTP/1.1 connections per origin and the three panels coexist on the same screen. With one stream per type, half the budget would go to connections that never finish and normal queries would queue behind them. **No `Last-Event-ID`**: the tokens are ephemeral and the snapshot sent on connect already carries the full truth.
- **Item events carry accumulated counters, not deltas**, so a tab that missed an event self-corrects on the next one with no need for replay. And the tokens go to a query separate from the state one: they arrive ~10 times per second (grouped every 100ms) and would re-render the bar, the counters and the stopwatch on each one.
- **The UNSPSC prefilter is NOT applied in `IDS` mode.** It decides what is worth spending LLM on when the system chooses; when the user chooses, they already decided. Applying it would make "analyze 5 selected" analyze 2 without explanation. It's the semantics `analizarUna()` already had and that Phase 4 fixes.
- **`planificar()` runs before creating the run**, and that fixes a real bug: `iniciarMatchingPendientes()` responded 202 with no company profile and the `PERFIL_EMPRESA_REQUERIDO` died in a `.catch` — the frontend said "matching started" and then nothing.
- **`server.requestTimeout = 0`**: Node's default (300s) cuts any longer request, and the SSE stream lasts as long as the batch does (hours). Without this, the panel freezes after exactly 5 minutes with no error in the logs. For the same reason `app.ts` **cannot** have `compression`: it would buffer the stream and freeze it just as silently.
- **Orphaned-run sweep on startup** (`server.ts`, before `listen`): an `EN_PROCESO` in the DB at startup can only be a backend that died mid-run. They are closed as `INTERRUMPIDO`, which is deliberately different from `FALLIDO` — "the model failed" and "the backend crashed" send you to debug different places. It goes **only** in `server.ts` and never in the CLI jobs: if `npm run analyze` swept on startup, it would take out the server's live run.
- **The in-memory lock does not cross processes**, and that was already broken: the CLI and the server each had their own copy of `let enProceso`. Now there is also a `hayRunActivo(tipo)` check against the DB, which is only possible now that the table exists. And the CLI jobs gain `SIGINT → cancelar()`, so Ctrl+C closes the run instead of leaving it orphaned.
- **`listarPendientesActivas` gains `orderBy: { fechaCierre: "asc" }`**: without a stable order, "23 of 140" and the estimated time mean nothing across runs. And processing what closes first is the right thing for whoever cancels midway.
- **`POST /api/licitaciones/:codigoExterno/{analisis,matching}` goes from synchronous 200 to 202**: it was the worst case of all (a request open for minutes with a button that said "Generating…"). Now it's a run of 1, with the same panel, cancelable and in the history. The `codigoExterno` path is kept because the detail's mental model is "analyze THIS tender"; translating it to id is three lines. Along the way it enables regenerating an already-completed analysis, which was previously forbidden (the button disappeared).

## Recorded architecture decision — domain code stays in Spanish

Translating the whole codebase to English was evaluated and **discarded**. The reason is not the cost (147 files, 600 comments to rewrite) but that the result would be worse:

1. **It would break a seam that doesn't exist today.** `codigoExterno` is a single word from the ChileCompra API (`CodigoExterno`) → the client → the DB → the UI. A `grep` finds it end to end. Translating it introduces a permanent mapping and cuts the grep at the boundary. Worse: `rawResponse` is ChileCompra's raw jsonb and keeps the Spanish keys forever, so you'd get a `tender.rawResponse.CodigoExterno` — inconsistent in a way today's code is not.
2. **It would lose precision.** "Licitación" is not a synonym for *tender*: it is a specific legal instrument of the Chilean State, with its own regulation and stages. This is the *ubiquitous language* principle: the code speaks the domain experts' language, and here the experts speak Spanish.
3. **The benefit is cheaper elsewhere.** What we wanted to solve was making the repo evaluable from the outside; that is covered by keeping the prose (README, this document) in English at ~5% of the effort.

This would be revisited if contributors who don't speak Spanish appeared, or if the matching engine were separated from the ChileCompra domain.

**What is never translated regardless**, in case this decision is ever reversed:

- **The LLM prompts.** The system prompt literally says *"All output text must be in Spanish"*, and the tenders are Chilean.
- **The UI strings.** The users are Chilean.
- **`rawResponse`.** It's not ours.

**Technical verbs are in English**: the implicit rule is technical verbs and concepts in English (`buildAnalisisPrompt`, `findByCodigoExterno`, `chunkText`, `ProcesoRunner.start()`, `close()`), domain nouns in Spanish (`licitacion`, `codigoExterno`, `segmentos`, `perfil`). See `ROADMAP.md` for the harmonization detail.
