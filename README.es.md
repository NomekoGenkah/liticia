> [English](README.md) · **Español**

# LicitIA

Asistente local de licitaciones públicas chilenas. Revisar a mano los cientos que se publican cada día es inviable: LicitIA las trae desde la API de [ChileCompra](https://api.mercadopublico.cl/), las analiza con un LLM local (Ollama) y las compara contra el perfil que declares para decirte cuáles conviene revisar — todo en tu propia infraestructura, sin mandar nada a una API de IA en la nube.

## Features

- **Ingesta**: licitaciones desde la API de ChileCompra por fecha/estado/organismo/proveedor, con deduplicación por `codigoExterno`, reintentos con backoff y control del límite diario del ticket. Manual o por scheduler (cron o intervalo).
- **Análisis con IA**: por licitación, un resumen ejecutivo, puntos clave, palabras clave y un nivel de complejidad.
- **Perfil + matching con IA**: declarás un único perfil (rubro, palabras clave, categorías UNSPSC, regiones, rango de monto; sirve para empresa o persona natural) y el sistema calcula por licitación un puntaje 0-100, una recomendación (Sí / No / Tal vez) y su justificación.
- **Procesos de IA en vivo**: al disparar un análisis, matching o indexado, el panel muestra cuántas van, cuál se está procesando y el texto que el modelo va escribiendo. Se pueden cancelar (corta al toque, y la licitación en curso vuelve a la cola sin marcarse como fallida), elegir cuáles se mandan, y cada corrida queda en un historial con qué pasó con cada una.
- **Documentos**: subís los anexos (PDF, DOCX o XLSX, hasta 20MB) y se les extrae el texto al momento. La descarga automática desde mercadopublico.cl no es posible — ver la decisión de arquitectura en `PLAN.md` —, así que los bajás vos de la ficha pública.
- **Preguntas sobre los documentos (RAG)**: una vez indexados, les preguntás en lenguaje natural ("¿cuál es el plazo de entrega?"). Las respuestas salen solo de los documentos cargados y vienen con los fragmentos que las respaldan.
- **Panel**: responde "¿qué miro hoy?" — cuántas cierran en 48 horas y esta semana, el horizonte de cierres de los próximos 14 días, y cuánto avanzó la IA.
- **API REST**: las rutas de `backend/src/routes/` son la documentación.

## Arquitectura

```
frontend (React + Vite)
  → backend (Node.js + Express)
      routes → services → repositories (Prisma) → clients (ChileCompraClient, OllamaClient)
          ↓
      PostgreSQL 16          Ollama (LLM local, en el host)
      + pgvector             chat: qwen3:8b / embeddings: nomic-embed-text
```

Ver `PLAN.md` para el detalle de cada fase y las decisiones de arquitectura registradas.

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose
- [Ollama](https://ollama.com/) corriendo en el host (no se dockeriza), con los dos modelos:
  ```
  ollama pull qwen3:8b            # análisis, matching y respuestas (OLLAMA_MODEL)
  ollama pull nomic-embed-text    # embeddings del RAG (OLLAMA_EMBED_MODEL)
  ```
  El de embeddings **debe ser de 768 dimensiones**: la columna `vector(768)` lo asume.
- Un ticket de la [API de ChileCompra](https://api.mercadopublico.cl/) (gratuito, se pide en su portal de desarrolladores)
- Node.js 22+ solo si vas a correr backend/frontend fuera de Docker

## Puesta en marcha

1. `cp .env.example .env` y completar `CHILECOMPRA_TICKET` con tu ticket real.
2. Levantar todo:
   ```
   docker compose up -d --build --renew-anon-volumes
   ```
3. Aplicar las migraciones (la primera vez, y cada vez que haya nuevas):
   ```
   docker compose exec backend npx prisma migrate deploy
   ```
4. Abrir [http://localhost:5173](http://localhost:5173). La API queda en [http://localhost:3000/api](http://localhost:3000/api).

El flujo típico: configurar el perfil en **Perfil de empresa**, y en **Procesos** ejecutar una ingesta y después el análisis y el matching de pendientes. Para preguntarle a los documentos de una licitación: subirlos en su detalle, indexarlos en **Procesos → Embeddings de documentos**, y usar la caja de preguntas que aparece en el detalle.

## Trabajar con Docker

### El comando de todos los días

```
docker compose up -d --build --renew-anon-volumes
```

Usá este por defecto: es el único que garantiza que lo que corre adentro coincide con el repo, y **las dos banderas son necesarias juntas**.

- `--build` reconstruye la imagen; sin esto Compose reusa la vieja y el `npm install` del Dockerfile nunca se vuelve a ejecutar.
- `--renew-anon-volumes` descarta los `node_modules` del contenedor, que se montan como volumen anónimo y sobreviven al recrearlo, tapando los de la imagen nueva.

Cada una sola no alcanza. Por eso, si agregás una dependencia y levantás con `docker compose up -d` a secas, el servicio explota con un `Can't resolve '<paquete>'` que no tiene nada que ver con tu código.

### Nunca uses `docker compose down -v`

`-v` borra los volúmenes **nombrados**, y ahí vive `pgdata`: te llevás puestas las licitaciones, los análisis, el matching, los documentos y sus embeddings. Recuperarlos es re-ingestar todo y volver a correr toda la IA. `docker compose down` a secas para el stack sin borrar nada.

Ojo con la confusión de banderas, que es fácil y cara:

- `-v` / `--volumes` → volúmenes nombrados → **destruye la base de datos**.
- `-V` / `--renew-anon-volumes` → solo `node_modules` → **seguro**, es el del comando de arriba.

### Aplicar un cambio del `.env`

```
docker compose up -d --force-recreate backend
```

Un `restart` no alcanza: el `.env` se inyecta vía `env_file` **al crear** el contenedor, así que el proceso reinicia con las variables viejas. Es fácil de pasar por alto porque no falla — el backend arranca bien y sigue usando el valor anterior. Si cambiaste algo y no ves el efecto, empezá por acá; `GET /api/health` te dice qué tope tiene cargado de verdad. Fuera de Docker no aplica: ahí dotenv lee el `.env` en cada arranque.

### Otras variantes

| Si querés… | Comando |
|---|---|
| Arrancar sin reconstruir (solo si no tocaste `package.json` ni los `Dockerfile`) | `docker compose up -d` |
| Operar un solo servicio | Agregar su nombre al final: `… --renew-anon-volumes frontend` |
| Ver por qué algo falla | `docker compose logs -f backend` |
| Parar todo, conservando los datos | `docker compose down` |

### Actualizar un checkout viejo

Después de traer cambios, además de `migrate deploy` puede hacer falta regenerar el Prisma Client **dentro del contenedor** (usa su propio `node_modules`, así que hacerlo solo en el host lo deja con el Client viejo):

```
docker compose exec backend npx prisma generate && docker compose restart backend
```

## Desarrollo local sin Docker

```
cd backend  && npm install && npm run prisma:generate && npm run prisma:migrate && npm run dev
cd frontend && npm install && npm run dev    # proxy /api → localhost:3000
```

## Scripts útiles

**Backend** (`backend/`):

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor en modo watch |
| `npm run build` / `npm start` | Build de producción y arranque |
| `npm run ingest` | Ingesta de licitaciones por CLI |
| `npm run analyze` | Análisis IA de pendientes por CLI (Ctrl+C lo cancela y cierra la corrida) |
| `npm run match` | Matching IA de pendientes por CLI |
| `npm run embed` | Indexa los documentos con texto extraído que aún no tienen fragmentos |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Chequeo de tipos sin emitir |

**Frontend** (`frontend/`): `npm run dev`, `npm run build`, `npm run lint` (oxlint), `npm test` (Vitest), `npm run preview`.

## Variables de entorno

La lista completa, con el porqué de cada una, está comentada en **`.env.example`** — es la fuente, no hay otra copia. Lo mínimo para arrancar es `CHILECOMPRA_TICKET`; el resto trae defaults que funcionan.

Para que un cambio tome efecto con Docker, ver [Aplicar un cambio del `.env`](#aplicar-un-cambio-del-env).

## Estructura del repo

```
backend/     API REST + jobs (Express, Prisma, Ollama, ChileCompra)
frontend/    Interfaz web (React, Vite, shadcn/ui)
storage/     Logs y documentos subidos, fuera de git
PLAN.md      Plan por fases y decisiones de arquitectura
ROADMAP.md   Notas de mantenimiento (tests del front, CI, docs en inglés — hecho)
```

## Integración continua

GitHub Actions (`.github/workflows/ci.yml`) corre en cada push a `main` y en cada pull request, en dos jobs:

- **backend**: `npm ci` → `prisma generate` → `npm run typecheck` → `npm test` (144 tests)
- **frontend**: `npm ci` → `npm run build` (incluye `tsc -b`) → `npm run lint` → `npm test`

No hace falta Postgres ni Ollama: los tests mockean los repositorios y el cliente de Ollama.

## Licencia

MIT — ver [LICENSE](LICENSE).
