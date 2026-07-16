# LicitIA

Asistente local de licitaciones públicas chilenas. Ingiere licitaciones desde la API de [ChileCompra](https://api.mercadopublico.cl/), las analiza con un LLM local (Ollama) y las compara contra el perfil de tu empresa para decirte cuáles conviene revisar — todo corriendo en tu propia infraestructura, sin enviar datos a servicios de IA externos.

## Propósito

Revisar manualmente cientos de licitaciones publicadas cada día para encontrar las relevantes para tu empresa es inviable. LicitIA automatiza ese filtrado: trae las licitaciones nuevas o actualizadas, genera un resumen y una extracción estructurada de cada una, y calcula un veredicto de "¿me conviene postular?" contra el perfil que declares — todo con un LLM corriendo localmente vía Ollama, sin depender de una API de IA en la nube.

## Features

- **Ingesta de licitaciones**: trae licitaciones desde la API pública de ChileCompra por fecha/estado/organismo/proveedor, con deduplicación por `codigoExterno`, reintentos con backoff y control del límite diario de requests del ticket. Ejecutable manualmente o por scheduler (cron o intervalo, configurable).
- **Análisis con IA**: para cada licitación, un LLM local (Ollama) genera un resumen ejecutivo, puntos clave, palabras clave y un nivel de complejidad.
- **Perfil de empresa + matching con IA**: declarás un único perfil (rubro, palabras clave, categorías UNSPSC, regiones, rango de monto — soporta tanto empresa como persona natural) y el sistema calcula, por licitación, un puntaje 0-100, una recomendación (Sí / No / Tal vez) y su justificación.
- **Frontend web**: listado de licitaciones con filtros y orden (incluye filtrar/ordenar por recomendación de matching), detalle completo por licitación con disparo manual de análisis/matching, gestión del perfil de empresa, y una pantalla de "Procesos" para disparar ingesta y los batches de IA con seguimiento de su estado.
- **API REST** documentada de forma implícita por las rutas en `backend/src/routes/` — listado y detalle de licitaciones, ingesta, análisis, matching y perfil de empresa.

## Arquitectura

```
frontend (React + Vite)
  → backend (Node.js + Express)
      routes → services → repositories (Prisma) → clients (ChileCompraClient, OllamaClient)
          ↓
      PostgreSQL 16          Ollama (LLM local, en el host)
```

Ver `PLAN.md` para el detalle de cada fase implementada y las decisiones de arquitectura registradas.

## Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose
- [Ollama](https://ollama.com/) corriendo en el host (no se dockeriza) con un modelo descargado, por ejemplo:
  ```
  ollama pull qwen3:8b
  ```
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

Desde ahí, el flujo típico es: entrar a **Procesos** y ejecutar una ingesta manual, luego disparar el análisis y el matching de pendientes (o configurar el perfil de empresa primero en **Perfil de empresa**, si todavía no existe).

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
- `OLLAMA_URL` / `OLLAMA_MODEL`: dónde está Ollama y qué modelo usar para análisis y matching.
- `SCHEDULE_MODE` / `SCHEDULE_VALUE`: modo del scheduler de ingesta automática (`cron` con expresión de 5 campos, o `interval` en milisegundos).
- `DATABASE_URL` / `POSTGRES_*`: conexión a Postgres.

## Estructura del repo

```
backend/     API REST + jobs (Express, Prisma, Ollama, ChileCompra)
frontend/    Interfaz web (React, Vite, shadcn/ui)
storage/     Logs de la aplicación, fuera de git
PLAN.md      Plan de implementación por fases y decisiones de arquitectura
```
