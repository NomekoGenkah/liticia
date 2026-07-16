# LicitIA

Asistente local de licitaciones públicas chilenas. Ingiere licitaciones desde la API de [ChileCompra](https://api.mercadopublico.cl/), las analiza con un LLM local (Ollama) y las compara contra el perfil de tu empresa para decirte cuáles conviene revisar — todo corriendo en tu propia infraestructura, sin enviar datos a servicios de IA externos.

## Propósito

Revisar manualmente cientos de licitaciones publicadas cada día para encontrar las relevantes para tu empresa es inviable. LicitIA automatiza ese filtrado: trae las licitaciones nuevas o actualizadas, genera un resumen y una extracción estructurada de cada una, y calcula un veredicto de "¿me conviene postular?" contra el perfil que declares — todo con un LLM corriendo localmente vía Ollama, sin depender de una API de IA en la nube.

## Features

- **Ingesta de licitaciones**: trae licitaciones desde la API pública de ChileCompra por fecha/estado/organismo/proveedor, con deduplicación por `codigoExterno`, reintentos con backoff y control del límite diario de requests del ticket. Ejecutable manualmente o por scheduler (cron o intervalo, configurable).
- **Análisis con IA**: para cada licitación, un LLM local (Ollama) genera un resumen ejecutivo, puntos clave, palabras clave y un nivel de complejidad.
- **Perfil de empresa + matching con IA**: declarás un único perfil (rubro, palabras clave, categorías UNSPSC, regiones, rango de monto — soporta tanto empresa como persona natural) y el sistema calcula, por licitación, un puntaje 0-100, una recomendación (Sí / No / Tal vez) y su justificación.
- **Documentos**: subís manualmente los anexos de una licitación (PDF, DOCX o XLSX, hasta 20MB) y LicitIA les extrae el texto al momento. La descarga automática desde mercadopublico.cl no es posible (ver la decisión de arquitectura en `PLAN.md`), así que los bajás vos desde la ficha pública y los cargás acá.
- **Preguntas sobre los documentos (RAG)**: una vez indexados, podés preguntarle en lenguaje natural a los documentos de una licitación ("¿cuál es el plazo de entrega?", "¿qué garantías piden?"). Las respuestas salen únicamente de los documentos cargados y vienen con los fragmentos exactos que las respaldan, con su archivo de origen y similitud.
- **Panel**: la pantalla de inicio responde "¿qué miro hoy?" — cuántas cierran en 48 horas y esta semana, un horizonte de los cierres de los próximos 14 días (donde se ven los días en que se apelotonan), las que cierran primero y cuánto avanzó la IA.
- **Frontend web**: listado de licitaciones con filtros y orden (incluye filtrar/ordenar por recomendación de matching), detalle completo por licitación con disparo manual de análisis/matching, carga de documentos y chat sobre ellos, gestión del perfil de empresa, y una pantalla de "Procesos" para disparar ingesta y los batches de IA con seguimiento de su estado. Tema claro/oscuro y selector de tipografía (engranaje del header), guardados en el navegador.
- **API REST** documentada de forma implícita por las rutas en `backend/src/routes/` — listado y detalle de licitaciones, ingesta, análisis, matching, perfil de empresa, documentos y preguntas.

## Arquitectura

```
frontend (React + Vite)
  → backend (Node.js + Express)
      routes → services → repositories (Prisma) → clients (ChileCompraClient, OllamaClient)
          ↓
      PostgreSQL 16          Ollama (LLM local, en el host)
      + pgvector             chat: qwen3:8b / embeddings: nomic-embed-text
```

Ver `PLAN.md` para el detalle de cada fase implementada y las decisiones de arquitectura registradas.

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose
- [Ollama](https://ollama.com/) corriendo en el host (no se dockeriza), con el modelo de chat y el de embeddings:
  ```
  ollama pull qwen3:8b            # análisis, matching y respuestas (configurable: OLLAMA_MODEL)
  ollama pull nomic-embed-text    # embeddings para las preguntas sobre documentos (OLLAMA_EMBED_MODEL)
  ```
  El de embeddings debe ser de 768 dimensiones: la columna `vector(768)` lo asume.
- Un ticket de la [API de ChileCompra](https://api.mercadopublico.cl/) (gratuito, se solicita en su portal de desarrolladores)
- Node.js 22+ si vas a correr backend/frontend fuera de Docker

## Puesta en marcha

1. Clonar el repo y copiar el archivo de entorno:
   ```
   cp .env.example .env
   ```
2. Completar en `.env` al menos `CHILECOMPRA_TICKET` con tu ticket real, y revisar `OLLAMA_MODEL` si vas a usar un modelo distinto a `qwen3:8b`.
3. Levantar Postgres, backend y frontend:
   ```
   docker compose up -d
   ```
4. Aplicar las migraciones de base de datos (una sola vez, o cada vez que haya migraciones nuevas):
   ```
   docker compose exec backend npx prisma migrate deploy
   ```
5. Abrir el frontend en [http://localhost:5173](http://localhost:5173). La API queda disponible en [http://localhost:3000/api](http://localhost:3000/api).

Desde ahí, el flujo típico es: entrar a **Procesos** y ejecutar una ingesta manual, luego disparar el análisis y el matching de pendientes (o configurar el perfil de empresa primero en **Perfil de empresa**, si todavía no existe). Para preguntarle a los documentos de una licitación: subirlos en su detalle, generar los embeddings en **Procesos → Embeddings de documentos**, y usar la caja de preguntas que aparece en el detalle.

### Si ya tenías LicitIA corriendo de antes

El servicio `postgres` pasó de `postgres:16` a `pgvector/pgvector:pg16-trixie` (necesario para el RAG). Los datos se conservan — el volumen `pgdata` se reusa tal cual —, pero hay que recrear el contenedor **antes** de migrar, o la migración falla al crear la extensión y queda marcada como fallida:

```
docker compose up -d --force-recreate postgres     # NUNCA con -v: borraría la base
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npx prisma generate    # el contenedor tiene su propio node_modules
docker compose restart backend
```

## Desarrollo local sin Docker

Backend:
```
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate   # aplica/crea migraciones contra el DATABASE_URL de la raíz del repo
npm run dev               # http://localhost:3000
```

Frontend:
```
cd frontend
npm install
npm run dev               # http://localhost:5173, proxy /api → localhost:3000
```

## Scripts útiles

**Backend** (`backend/`):
| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor en modo watch |
| `npm run build` / `npm start` | Build de producción y arranque |
| `npm run ingest` | Corre la ingesta de licitaciones por CLI (forma síncrona) |
| `npm run analyze` | Corre el batch de análisis IA de pendientes por CLI |
| `npm run match` | Corre el batch de matching IA de pendientes por CLI |
| `npm run embed` | Indexa los documentos con texto extraído que aún no tienen fragmentos |
| `npm test` | Suite de tests (Vitest) |
| `npm run typecheck` | Chequeo de tipos sin emitir |

**Frontend** (`frontend/`):
| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Build de producción (`tsc -b && vite build`) |
| `npm run lint` | Lint (oxlint) |
| `npm run preview` | Sirve el build de producción localmente |

## Variables de entorno

Ver `.env.example` para la lista completa con comentarios. Las más relevantes para arrancar:

- `CHILECOMPRA_TICKET` / `CHILECOMPRA_API_BASE`: credenciales y base URL de la API de ChileCompra.
- `OLLAMA_URL` / `OLLAMA_MODEL`: dónde está Ollama y qué modelo usar para análisis, matching y respuestas.
- `OLLAMA_EMBED_MODEL`: modelo de embeddings del RAG (default `nomic-embed-text`). Debe ser de 768 dimensiones — la columna `vector(768)` lo asume, y cambiarlo obliga a re-indexar los documentos.
- `OLLAMA_RAG_NUM_CTX` / `RAG_TOP_K`: ventana de contexto y cuántos fragmentos se le pasan al modelo en cada pregunta. Subir `RAG_TOP_K` sin subir `OLLAMA_RAG_NUM_CTX` hace que Ollama trunque el prompt en silencio.
- `CHILECOMPRA_MAX_REQUESTS_DIA`: tope propio de requests diarias a ChileCompra (default 10.000, que es el límite real del ticket y no es modificable). Al alcanzarlo, la ingesta corta con un 429 `LIMITE_LOCAL_REQUESTS` — es tu guardarraíl, no un rechazo de ChileCompra. El contador se reinicia cada día y `GET /api/health` muestra cómo va.
- `SCHEDULE_MODE` / `SCHEDULE_VALUE`: modo del scheduler de ingesta automática (`cron` con expresión de 5 campos, o `interval` en milisegundos).
- `DATABASE_URL` / `POSTGRES_*`: conexión a Postgres.

### Aplicar un cambio del `.env`

Con Docker no basta `docker compose restart backend`: el `.env` se inyecta vía `env_file` **al crear** el contenedor, así que un restart reinicia el proceso pero conserva las variables viejas. Hay que recrearlo:

```
docker compose up -d --force-recreate backend
```

Es fácil de pasar por alto porque no falla: el backend arranca bien y sigue usando el valor anterior. Si cambiaste algo y no ves el efecto, empieza por acá — `GET /api/health` te dice qué tope tiene cargado de verdad.

Corriendo fuera de Docker (`npm run dev`) no aplica: ahí el backend lee el `.env` de la raíz con dotenv en cada arranque, así que basta con reiniciar el proceso.

## Estructura del repo

```
backend/     API REST + jobs (Express, Prisma, Ollama, ChileCompra)
frontend/    Interfaz web (React, Vite, shadcn/ui)
storage/     Logs de la aplicación, fuera de git
PLAN.md      Plan de implementación por fases y decisiones de arquitectura
```
