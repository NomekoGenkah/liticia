# Roadmap

Trabajo pendiente que no agrega features: es dejar el repo mantenible y presentable. Las fases de producto están en `PLAN.md`, que es otra cosa y va aparte.

> **Estado (2026-07-17): los cuatro puntos están hechos.**
> 1. Tests del frontend — Vitest + Testing Library, 37 tests (`format`, `estimarRestante`, `leerFiltros`, el reductor `aplicar` de SSE, y los componentes `LicitacionesTable` y `PendientesPreview`).
> 2. CI — `.github/workflows/ci.yml`, dos jobs (backend y frontend) como se describe abajo.
> 3. Documentación a inglés — `README.md` (inglés) + `README.es.md` (español) enlazados, y `PLAN.md` en inglés con la decisión del idioma del código registrada ahí.
> 4. Verbos técnicos — **parcial a propósito**: `arrancar→start` y `cerrar→close` (+ `cerrarItem→closeItem`) hechos. `planificar→plan` y `correr→run` se dejaron sin tocar: chocan con los sustantivos del dominio `PlanProceso`/`ProcesoRun` (`plan`, `run`) y renombrarlos deja `this.run(run.id, plan)`, que es menos legible, no más. `cerrarHuerfanos`/`cerrarHuerfanas` también se dejaron (fuera del set acordado).

## Orden

| # | Qué | Esfuerzo | Por qué en este orden |
|---|---|---|---|
| 1 | Tests del frontend | M | Sin esto, el CI del paso 2 solo puede correr typecheck y build |
| 2 | CI | S | Conviene tenerlo antes de cualquier refactor grande — ver abajo |
| 3 | Documentación a inglés | M | El punto que de verdad abre el repo a quien no lee español |
| 4 | Emparejar los verbos técnicos | S | Opcional. Cosmético y acotado |

> **Nota sobre el orden del CI.** La idea original era dejarlo para el final. La recomendación es adelantarlo: su valor es máximo *antes* de tocar mucho código, no después, y el paso 1 existe en parte para darle algo que correr.
>
> Evidencia de que hace falta: el build del frontend estuvo roto en `main` desde el commit de la Fase 7 y nadie se enteró hasta la Fase 8.

---

## 1. Tests del frontend

Hoy son cero: no hay ni `vitest` ni `@testing-library/react` en `frontend/package.json`. El backend tiene 144.

**No apuntar a igualar ese número.** El backend tiene 144 porque ahí vive la lógica; la del frontend es delgada y se concentra en pocos lugares. Vale la pena testear:

- **`hooks/useProcesoEventos.ts` → `aplicar()`**. Es lo más valioso: el reductor que traduce cada evento SSE al caché. Tiene reglas reales que hoy solo viven en comentarios — el snapshot pisa el estado local, los tokens no tocan la query del estado, `item-reintentado` descarta el buffer, los contadores llegan acumulados y no como deltas. Se testea con un `QueryClient` de verdad y eventos falsos.
- **`lib/format.ts`**. Puras y con bordes reales (`formatDuracion` corta en dos unidades; `formatMonto` tiene un fallback para monedas que `Intl` no conoce).
- **`estimarRestante()`** (hoy privada en `ProcesoProgreso`): hay que extraerla. Su regla es "sin ítems terminados no hay ETA", y un ETA inventado en el primer segundo es peor que ninguno.
- **`leerFiltros()`** (hoy privada en `LicitacionesPage`): hay que extraerla. Valida input no confiable — la URL la escribe cualquiera.
- **Componentes**, dos que ya nos mordieron: el tri-estado del checkbox de `LicitacionesTable` y su `stopPropagation` (tildar no debe navegar al detalle), y la selección de `PendientesPreview`.

**Setup**: `vitest` + `@testing-library/react` + `jsdom`. Alinear con el backend, que ya usa Vitest.

**E2E queda afuera del CI**, pero vale anotar por qué: manejar el navegador durante la Fase 8 encontró dos bugs que ningún test unitario hubiera visto (dos botones "Limpiar" idénticos en pantalla, y la caída de 59 a 19 fps del modal). El problema es que un E2E real necesita el stack levantado **y Ollama con los modelos**, que en CI no existe. Si se quiere, va como script manual aparte, nunca como gate.

## 2. CI

Un workflow de GitHub Actions que corra, en backend y frontend:

```
backend:   npm ci → npx prisma generate → npm run typecheck → npm test
frontend:  npm ci → npm run build (ya incluye tsc -b) → npm run lint → npm test
```

- `prisma generate` **antes** del typecheck: sin el Client generado, el backend no compila.
- No hace falta Postgres: los 144 tests mockean los repositorios. Si algún día hay tests de integración, ahí sí un servicio `postgres` en el job.
- Ollama no existe en CI y no debe: los tests del `OllamaClient` mockean el paquete.

## 3. Documentación a inglés

El objetivo real es que alguien que no lee español pueda evaluar el repo. Eso se consigue con la prosa, no con los identificadores: nadie va a leer `procesoRunner.ts` línea por línea, pero sí el README y —si le interesa— el registro de decisiones.

- **`README.md` en inglés**, con **`README.es.md`** en español enlazado desde la primera línea de cada uno (convención habitual en GitHub: `README.<lang>.md`). Bilingüe porque es la puerta de entrada, es corto (~1.280 palabras tras la compresión) y es estable.
- **`PLAN.md` en inglés, sin copia en español.** Es el mejor activo del repo — el porqué del prefiltro UNSPSC con sus números, la decisión de no evadir el reCAPTCHA, por qué `INTERRUMPIDO` no es `FALLIDO` — y hoy es ilegible para media audiencia. Va en un solo idioma y no bilingüe porque crece con cada fase: dos copias de un documento vivo se desincronizan en el primer commit, mientras que el README no.
- **Registrar en `PLAN.md`** la decisión de abajo (el código se queda en español), junto al resto de las decisiones de arquitectura. Una decisión documentada sobre el idioma del dominio vale más que 147 archivos renombrados.

## 4. Emparejar los verbos técnicos

Opcional y cosmético, pero barato. El repo ya usa —sin que nadie lo diseñara— inglés para el vocabulario técnico y español para el del dominio: `buildAnalisisPrompt`, `findByCodigoExterno`, `chunkText`, `ensureDocumentosDir`, `errorHandler`, `buildPaginationMeta`. La regla implícita es **verbos y conceptos técnicos en inglés, sustantivos del dominio en español**, y se cumple en la mayor parte del código.

Donde no se cumple, emparejarlo: `ProcesoRunner.planificar()` → `plan()`, `arrancar()` → `start()`, `correr()` → `run()`, `cerrar()` → `close()`. Nada de esto toca el dominio (`licitacion`, `codigoExterno`, `segmentos`, `perfil` se quedan) ni la base de datos.

No es urgente. Si nunca se hace, el repo sigue siendo coherente.

> **Hecho en parte** (ver el estado al inicio): `start`/`close`/`closeItem` sí; `plan`/`run` no, porque colisionan con los sustantivos `PlanProceso`/`ProcesoRun`.

---

## Decisión: el código se queda en español

Se evaluó traducir todo el código a inglés y **se descartó**. El motivo no es el costo (147 archivos, 600 comentarios que habría que reescribir), sino que el resultado sería peor:

1. **Rompería una costura que hoy no existe.** `codigoExterno` es una sola palabra desde la API de ChileCompra (`CodigoExterno`) → el cliente → la base → la UI. Un `grep` la encuentra de punta a punta. Traducirla mete un mapeo permanente y corta el grep en la frontera. Peor: `rawResponse` es el jsonb crudo de ChileCompra y conserva las claves en español para siempre, así que quedaría un `tender.rawResponse.CodigoExterno` — incoherente de una forma que el código de hoy no lo es.
2. **Perdería precisión.** "Licitación" no es sinónimo de *tender*: es un instrumento legal específico del Estado de Chile, con su reglamento y sus etapas. Es el principio de *ubiquitous language*: el código habla el idioma de los expertos del dominio, y acá los expertos hablan español.
3. **El beneficio se consigue más barato.** Lo que se quería resolver era que el repo fuera evaluable desde afuera; eso lo cubre el paso 3 con el ~5% del esfuerzo.

Se revisaría esta decisión si aparecieran contribuidores que no hablan español, o si el motor de matching se separara del dominio de ChileCompra (ver la evaluación de extenderlo a bolsas de trabajo, que no cambia nada: Computrabajo y el mercado objetivo también son hispanohablantes).

**Lo que igual no se traduce nunca**, por si la decisión se revierte algún día:

- **Los prompts al LLM.** El system prompt dice literalmente *"Todo el texto de salida debe estar en español"*, y las licitaciones son chilenas.
- **Las cadenas de la UI.** Los usuarios son chilenos.
- **`rawResponse`.** No es nuestro.

## Fuera de alcance

Anotado para que se note que es decisión y no olvido:

- **Auth, multi-usuario, deploy.** La app es mono-usuario y local a propósito; el lock en memoria y el barrido de huérfanos del arranque asumen una sola instancia, y está documentado en `PLAN.md`.
- **E2E en CI.** Ver el paso 1.
