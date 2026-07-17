# LicitIA

Asistente local de licitaciones públicas chilenas. Ingiere licitaciones desde la API de [ChileCompra](https://api.mercadopublico.cl/), las analiza con un LLM local (Ollama) y las compara contra el perfil de tu empresa para decirte cuáles conviene revisar — todo corriendo en tu propia infraestructura, sin enviar datos a servicios de IA externos.

## Propósito

Revisar manualmente cientos de licitaciones publicadas cada día para encontrar las relevantes para tu empresa es inviable. LicitIA automatiza ese filtrado: trae las licitaciones nuevas o actualizadas, genera un resumen y una extracción estructurada de cada una, y calcula un veredicto de "¿me conviene postular?" contra el perfil que declares — todo con un LLM corriendo localmente vía Ollama, sin depender de una API de IA en la nube.

## Features

- **Ingesta de licitaciones**: trae licitaciones desde la API pública de ChileCompra por fecha/estado/organismo/proveedor, con deduplicación por `codigoExterno`, reintentos con backoff y control del límite diario de requests del ticket. Ejecutable manualmente o por scheduler (cron o intervalo, configurable).
- **Análisis con IA**: para cada licitación, un LLM local (Ollama) genera un resumen ejecutivo, puntos clave, palabras clave y un nivel de complejidad.
- **Procesos de IA en vivo**: al disparar un análisis, matching o indexado, un panel muestra el progreso real — cuántas van, cuál se está procesando, cuánto falta, y el texto que el modelo va escribiendo a medida que sale. Se pueden cancelar en cualquier momento (corta al toque; la licitación en curso vuelve a la cola sin marcarse como fallida), elegir cuáles se mandan (tildándolas en el listado o destildándolas en la vista previa), y cada corrida queda en un historial con qué pasó con cada licitación.
- **Perfil de empresa + matching con IA**: declarás un único perfil (rubro, palabras clave, categorías UNSPSC, regiones, rango de monto — soporta tanto empresa como persona natural) y el sistema calcula, por licitación, un puntaje 0-100, una recomendación (Sí / No / Tal vez) y su justificación.
- **Documentos**: subís manualmente los anexos de una licitación (PDF, DOCX o XLSX, hasta 20MB) y LicitIA les extrae el texto al momento. La descarga automática desde mercadopublico.cl no es posible (ver la decisión de arquitectura en `PLAN.md`), así que los bajás vos desde la ficha pública y los cargás acá.
- **Preguntas sobre los documentos (RAG)**: una vez indexados, podés preguntarle en lenguaje natural a los documentos de una licitación ("¿cuál es el plazo de entrega?", "¿qué garantías piden?"). Las respuestas salen únicamente de los documentos cargados y vienen con los fragmentos exactos que las respaldan, con su archivo de origen y similitud.
- **Panel**: la pantalla de inicio responde "¿qué miro hoy?" — cuántas cierran en 48 horas y esta semana, un horizonte de los cierres de los próximos 14 días (donde se ven los días en que se apelotonan), las que cierran primero y cuánto avanzó la IA.
- **Frontend web**: listado de licitaciones con filtros, orden y selección múltiple (para mandar a analizar/matchear solo lo que elijas), detalle completo por licitación con disparo manual de análisis/matching, carga de documentos y chat sobre ellos, gestión del perfil de empresa, y una pantalla de "Procesos" para disparar ingesta y los procesos de IA, verlos correr en vivo y revisar el historial. Tema claro/oscuro y selector de tipografía (engranaje del header), guardados en el navegador.
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
   docker compose up -d --build --renew-anon-volumes
   ```
4. Aplicar las migraciones de base de datos (una sola vez, o cada vez que haya migraciones nuevas):
   ```
   docker compose exec backend npx prisma migrate deploy
   ```
5. Abrir el frontend en [http://localhost:5173](http://localhost:5173). La API queda disponible en [http://localhost:3000/api](http://localhost:3000/api).

Desde ahí, el flujo típico es: entrar a **Procesos** y ejecutar una ingesta manual, luego disparar el análisis y el matching de pendientes (o configurar el perfil de empresa primero en **Perfil de empresa**, si todavía no existe). Para preguntarle a los documentos de una licitación: subirlos en su detalle, generar los embeddings en **Procesos → Embeddings de documentos**, y usar la caja de preguntas que aparece en el detalle.

## Trabajar con Docker

### El comando de todos los días

```
docker compose up -d --build --renew-anon-volumes
```

Usá este por defecto. Es el único que garantiza que lo que corre adentro coincide con lo que hay en el repo, porque hace las dos cosas que hacen falta:

- `--build` reconstruye las imágenes. Sin esto, Compose reusa la imagen que ya existe y el `npm install` del Dockerfile nunca se vuelve a ejecutar.
- `--renew-anon-volumes` descarta los `node_modules` de los contenedores. Los servicios montan `/app/node_modules` como volumen anónimo (ver `docker-compose.yml`), y Compose los conserva al recrear un contenedor, así que el `node_modules` viejo tapa el de la imagen nueva.

**Las dos son necesarias juntas.** Cada una sola no alcanza: `--build` deja el volumen viejo tapando la imagen nueva, y `--renew-anon-volumes` repuebla el volumen desde una imagen desactualizada. Por eso, si agregás una dependencia al `package.json` y levantás con `docker compose up -d` a secas, no se instala y el servicio explota con un error de módulo no encontrado (`Can't resolve '<paquete>'`) que no tiene nada que ver con tu código.

`--renew-anon-volumes` **no toca la base de datos**: solo recrea volúmenes *anónimos*, y `pgdata` es un volumen *nombrado*. Se parece a `-v`, pero no tiene nada que ver — ver el aviso de abajo.

### Variantes

| Si querés… | Comando |
|---|---|
| Arrancar sin reconstruir, más rápido (solo si no tocaste `package.json` ni los `Dockerfile`) | `docker compose up -d` |
| Aplicar un cambio del `.env` | `docker compose up -d --force-recreate backend` |
| Operar un solo servicio | Agregar su nombre al final: `docker compose up -d --build --renew-anon-volumes frontend` |
| Ver por qué algo falla | `docker compose logs -f backend` |
| Parar todo, conservando los datos | `docker compose down` |

### Nunca uses `docker compose down -v`

La bandera `-v` borra los volúmenes **con nombre**, y ahí vive `pgdata`: te llevás puestas las licitaciones ingestadas, los análisis, el matching, los documentos y sus embeddings. Recuperarlos significa re-ingestar desde ChileCompra y volver a correr toda la IA. `docker compose down` a secas para todo el stack sin borrar nada.

Cuidado con la confusión de banderas, que es fácil y cara:

- `-v` / `--volumes` → borra volúmenes nombrados → **destruye la base de datos**.
- `-V` / `--renew-anon-volumes` → solo volúmenes anónimos (`node_modules`) → **seguro**, es el del comando de arriba.

### Aplicar un cambio del `.env`

Con Docker no basta `docker compose restart backend`: el `.env` se inyecta vía `env_file` **al crear** el contenedor, así que un restart reinicia el proceso pero conserva las variables viejas. Hay que recrearlo:

```
docker compose up -d --force-recreate backend
```

Es fácil de pasar por alto porque no falla: el backend arranca bien y sigue usando el valor anterior. Si cambiaste algo y no ves el efecto, empieza por acá — `GET /api/health` te dice qué tope tiene cargado de verdad.

Corriendo fuera de Docker (`npm run dev`) no aplica: ahí el backend lee el `.env` de la raíz con dotenv en cada arranque, así que basta con reiniciar el proceso.

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
| `npm run analyze` | Corre el análisis IA de pendientes por CLI (Ctrl+C lo cancela y cierra la corrida) |
| `npm run match` | Corre el matching IA de pendientes por CLI |
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

Ver `.env.example` para la lista completa con comentarios. Para que un cambio tome efecto con Docker, ver [Aplicar un cambio del `.env`](#aplicar-un-cambio-del-env). Las más relevantes para arrancar:

- `CHILECOMPRA_TICKET` / `CHILECOMPRA_API_BASE`: credenciales y base URL de la API de ChileCompra.
- `OLLAMA_URL` / `OLLAMA_MODEL`: dónde está Ollama y qué modelo usar para análisis, matching y respuestas.
- `OLLAMA_STREAM_IDLE_TIMEOUT_MS` (default 60s): máximo hueco tolerado **entre tokens** en análisis y matching, que van con streaming. Detecta un Ollama colgado sin cortar una generación que está saliendo bien: mientras el modelo escriba, sigue por más que tarde. `OLLAMA_STREAM_HARD_CAP_MS` (default 10min) es la red de seguridad. `OLLAMA_REQUEST_TIMEOUT_MS` (default 60s) sigue siendo el tope de pared, pero solo de las llamadas sin streaming: embeddings y respuestas del RAG.
- `OLLAMA_THINK` (default `false`): con `true`, los modelos híbridos como qwen3 razonan antes de responder y ese razonamiento se ve en vivo en el panel de Procesos, en un canal aparte de la respuesta. Cuesta tokens (y tiempo) en cada licitación.
- `OLLAMA_EMBED_MODEL`: modelo de embeddings del RAG (default `nomic-embed-text`). Debe ser de 768 dimensiones — la columna `vector(768)` lo asume, y cambiarlo obliga a re-indexar los documentos.
- `OLLAMA_RAG_NUM_CTX` / `RAG_TOP_K`: ventana de contexto y cuántos fragmentos se le pasan al modelo en cada pregunta. Subir `RAG_TOP_K` sin subir `OLLAMA_RAG_NUM_CTX` hace que Ollama trunque el prompt en silencio.
- `CHILECOMPRA_MAX_REQUESTS_DIA`: tope propio de requests diarias a ChileCompra (default 10.000, que es el límite real del ticket y no es modificable). Al alcanzarlo, la ingesta corta con un 429 `LIMITE_LOCAL_REQUESTS` — es tu guardarraíl, no un rechazo de ChileCompra. El contador se reinicia cada día y `GET /api/health` muestra cómo va.
- `SCHEDULE_MODE` / `SCHEDULE_VALUE`: modo del scheduler de ingesta automática (`cron` con expresión de 5 campos, o `interval` en milisegundos).
- `DATABASE_URL` / `POSTGRES_*`: conexión a Postgres.

## Estructura del repo

```
backend/     API REST + jobs (Express, Prisma, Ollama, ChileCompra)
frontend/    Interfaz web (React, Vite, shadcn/ui)
storage/     Logs de la aplicación, fuera de git
PLAN.md      Plan de implementación por fases y decisiones de arquitectura
```
