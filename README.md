> **English** · [Español](README.es.md)

# LicitIA

A local assistant for Chilean public procurement tenders (*licitaciones*). Hundreds are published every day, and reviewing them by hand is unfeasible: LicitIA pulls them from the [ChileCompra API](https://api.mercadopublico.cl/), analyzes each one with a local LLM (Ollama), and scores them against the profile you declare so you know which ones are worth a look — all on your own infrastructure, without sending anything to a cloud AI provider.

> A *licitación* is a specific legal instrument of the Chilean State, with its own regulation and stages — not a generic "tender". The domain terms in the code stay in Spanish on purpose; see the architecture decision in `PLAN.md`.

## Features

- **Ingestion**: tenders from the ChileCompra API by date/status/organization/supplier, deduplicated by `codigoExterno`, with retries and backoff and daily-quota tracking per ticket. Manual or scheduled (cron or interval).
- **AI analysis**: per tender, an executive summary, key points, keywords and a complexity level.
- **Profile + AI matching**: you declare a single profile (line of business, keywords, UNSPSC categories, regions, amount range; works for a company or an individual) and the system computes, per tender, a 0–100 score, a recommendation (Yes / No / Maybe) and its rationale.
- **Live AI processes**: when you trigger an analysis, matching or indexing run, the panel shows how many are done, which one is in flight and the text the model is writing. Runs can be cancelled (aborts immediately, and the tender in progress returns to the queue without being marked as failed), you can pick which ones to send, and every run is kept in a history with what happened to each item.
- **Documents**: you upload the attachments (PDF, DOCX or XLSX, up to 20MB) and their text is extracted on the spot. Automatic download from mercadopublico.cl is not possible — see the architecture decision in `PLAN.md` — so you download them yourself from the public listing.
- **Questions over the documents (RAG)**: once indexed, you ask them in natural language ("what is the delivery deadline?"). Answers come only from the loaded documents and include the fragments that back them up.
- **Panel**: answers "what should I look at today?" — how many close within 48 hours and this week, the closing horizon for the next 14 days, and how far the AI has gotten.
- **REST API**: the routes in `backend/src/routes/` are the documentation.

## Architecture

```
frontend (React + Vite)
  → backend (Node.js + Express)
      routes → services → repositories (Prisma) → clients (ChileCompraClient, OllamaClient)
          ↓
      PostgreSQL 16          Ollama (local LLM, on the host)
      + pgvector             chat: qwen3:8b / embeddings: nomic-embed-text
```

See `PLAN.md` for the detail of each phase and the recorded architecture decisions.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Ollama](https://ollama.com/) running on the host (not dockerized), with both models:
  ```
  ollama pull qwen3:8b            # analysis, matching and answers (OLLAMA_MODEL)
  ollama pull nomic-embed-text    # RAG embeddings (OLLAMA_EMBED_MODEL)
  ```
  The embedding model **must be 768-dimensional**: the `vector(768)` column assumes it.
- A [ChileCompra API](https://api.mercadopublico.cl/) ticket (free, requested from their developer portal)
- Node.js 22+ only if you plan to run the backend/frontend outside Docker

## Getting started

1. `cp .env.example .env` and fill in `CHILECOMPRA_TICKET` with your real ticket.
2. Bring everything up:
   ```
   docker compose up -d --build --renew-anon-volumes
   ```
3. Apply the migrations (the first time, and whenever there are new ones):
   ```
   docker compose exec backend npx prisma migrate deploy
   ```
4. Open [http://localhost:5173](http://localhost:5173). The API lives at [http://localhost:3000/api](http://localhost:3000/api).

The typical flow: set up your profile in **Perfil de empresa**, and in **Procesos** run an ingestion and then the analysis and matching of pending items. To ask questions about a tender's documents: upload them in its detail view, index them in **Procesos → Embeddings de documentos**, and use the question box that appears in the detail view.

## Working with Docker

### The everyday command

```
docker compose up -d --build --renew-anon-volumes
```

Use this by default: it's the only one that guarantees what runs inside matches the repo, and **both flags are needed together**.

- `--build` rebuilds the image; without it Compose reuses the old one and the Dockerfile's `npm install` never runs again.
- `--renew-anon-volumes` discards the container's `node_modules`, which are mounted as an anonymous volume and survive re-creation, shadowing the ones in the new image.

Either flag alone is not enough. So if you add a dependency and bring things up with a plain `docker compose up -d`, the service blows up with a `Can't resolve '<package>'` that has nothing to do with your code.

### Never use `docker compose down -v`

`-v` deletes **named** volumes, and that's where `pgdata` lives: you'd wipe out the tenders, the analyses, the matching, the documents and their embeddings. Recovering them means re-ingesting everything and re-running all the AI. Use a plain `docker compose down` to stop the stack without deleting anything.

Watch out for the flag confusion, which is easy and costly:

- `-v` / `--volumes` → named volumes → **destroys the database**.
- `-V` / `--renew-anon-volumes` → only `node_modules` → **safe**, it's the one in the command above.

### Applying a `.env` change

```
docker compose up -d --force-recreate backend
```

A `restart` is not enough: the `.env` is injected via `env_file` **at container creation**, so the process restarts with the old variables. It's easy to miss because it doesn't fail — the backend starts fine and keeps using the previous value. If you changed something and don't see the effect, start here; `GET /api/health` tells you which cap it actually has loaded. Outside Docker this doesn't apply: there dotenv reads the `.env` on every start.

### Other variants

| If you want to… | Command |
|---|---|
| Start without rebuilding (only if you didn't touch `package.json` or the `Dockerfile`s) | `docker compose up -d` |
| Operate a single service | Append its name: `… --renew-anon-volumes frontend` |
| See why something fails | `docker compose logs -f backend` |
| Stop everything, keeping the data | `docker compose down` |

### Updating an old checkout

After pulling changes, besides `migrate deploy` you may need to regenerate the Prisma Client **inside the container** (it uses its own `node_modules`, so doing it only on the host leaves it with the old Client):

```
docker compose exec backend npx prisma generate && docker compose restart backend
```

## Local development without Docker

```
cd backend  && npm install && npm run prisma:generate && npm run prisma:migrate && npm run dev
cd frontend && npm install && npm run dev    # proxy /api → localhost:3000
```

## Useful scripts

**Backend** (`backend/`):

| Script | What it does |
|---|---|
| `npm run dev` | Server in watch mode |
| `npm run build` / `npm start` | Production build and start |
| `npm run ingest` | Tender ingestion via CLI |
| `npm run analyze` | AI analysis of pending items via CLI (Ctrl+C cancels it and closes the run) |
| `npm run match` | AI matching of pending items via CLI |
| `npm run embed` | Indexes documents with extracted text that don't have chunks yet |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Type check without emitting |

**Frontend** (`frontend/`): `npm run dev`, `npm run build`, `npm run lint` (oxlint), `npm test` (Vitest), `npm run preview`.

## Environment variables

The full list, with the reason for each one, is commented in **`.env.example`** — that's the source, there is no other copy. The minimum to get started is `CHILECOMPRA_TICKET`; the rest ship with working defaults.

For a change to take effect with Docker, see [Applying a `.env` change](#applying-a-env-change).

## Repository layout

```
backend/     REST API + jobs (Express, Prisma, Ollama, ChileCompra)
frontend/    Web interface (React, Vite, shadcn/ui)
storage/     Logs and uploaded documents, outside git
PLAN.md      Phased plan and architecture decisions
ROADMAP.md   Maintenance notes (frontend tests, CI, English docs — all done)
```

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and on every pull request, in two jobs:

- **backend**: `npm ci` → `prisma generate` → `npm run typecheck` → `npm test` (144 tests)
- **frontend**: `npm ci` → `npm run build` (includes `tsc -b`) → `npm run lint` → `npm test`

No Postgres or Ollama is needed: the tests mock the repositories and the Ollama client.
