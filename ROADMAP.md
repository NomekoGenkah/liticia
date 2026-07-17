# Roadmap

Trabajo pendiente que no agrega features: es dejar el repo mantenible y presentable. Las fases de producto están en `PLAN.md`, que es otra cosa y va aparte.

## Orden

| # | Qué | Esfuerzo | Por qué en este orden |
|---|---|---|---|
| 1 | Tests del frontend | M | Sin esto, el CI del paso 2 solo puede correr typecheck y build |
| 2 | CI | S | Tiene que estar **antes** del paso 3, no después — ver abajo |
| 3 | Código a inglés | **L** | Es el refactor más grande del repo; conviene hacerlo con el CI ya gateando |
| 4 | README bilingüe | S | Al final: describe el repo ya en inglés |

> **Nota sobre el orden del CI.** La idea original era dejarlo para el final. La recomendación es adelantarlo al segundo lugar, porque su valor es máximo justo durante el paso 3: un refactor mecánico que toca 147 archivos es exactamente el momento en que querés un gate verde en cada commit. Hacer el refactor más riesgoso del proyecto sin CI, y recién después agregarlo, usa la herramienta cuando ya no hace falta. Además el paso 1 existe en parte para darle al CI algo que correr.
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

## 3. Código a inglés

**El grande.** 147 archivos, ~12.000 líneas. Hoy identificadores, comentarios, códigos de error y modelos de datos están en español.

### Lo que NO se traduce

Esto primero, porque confundirlo rompe el producto:

- **Los prompts al LLM.** `analisisPrompt.ts` / `matchingPrompt.ts` están en español a propósito y el system prompt dice literalmente *"Todo el texto de salida debe estar en español"*. Las licitaciones son chilenas y el usuario lee español.
- **Las cadenas de la UI.** Mismo motivo: los usuarios son chilenos.
- **`rawResponse`.** Es el JSON crudo de ChileCompra, con sus claves en español (`CodigoExterno`, `FechaCierre`). No es nuestro.
- **`PLAN.md`.** Decidir aparte. Es el registro de decisiones y es prosa larga; traducirlo es un proyecto en sí. Si el objetivo es que se lea desde afuera, va después del paso 4.

### Los tres riesgos reales

1. **Renombrar modelos de Prisma puede borrar datos.** `prisma migrate dev` frecuentemente genera `DROP COLUMN` + `ADD COLUMN` en vez de `ALTER TABLE ... RENAME`, y eso destruye la columna en silencio. Hay 9 tablas con nombre en español (`Licitacion`, `LicitacionAnalisis`, `IngestaRun`…). **La migración del rename se revisa a mano, línea por línea, antes de aplicarla.** Todo el README del repo existe en parte para no perder `pgdata`; este es el único paso del roadmap que puede lograrlo.
   - Escape hatch si se quiere separar el riesgo: renombrar los modelos en el schema pero dejar `@@map("Licitacion")` para conservar el nombre de tabla. El código queda en inglés con cero riesgo de datos, a cambio de que la base siga en español. Es deuda, pero deuda acotada y visible.
2. **Los 600 comentarios del backend son el mejor activo del repo.** Explican *por qué*, no *qué* — por qué el `fetch` compone signals en vez de pisarlos, por qué el prefiltro va por segmento y no por código exacto, por qué `INTERRUMPIDO` no es `FALLIDO`. **Hay que reescribirlos en inglés, no traducirlos.** Un comentario bueno mal traducido es peor que un comentario bueno en español. Esto es el grueso del trabajo y no es mecánico.
3. **Los códigos de error son un contrato entre backend y frontend.** `PERFIL_EMPRESA_REQUERIDO`, `ANALISIS_REQUERIDO`, `PROCESO_EN_PROCESO` y compañía viajan como strings y el frontend los matchea literal (los mapas `ERRORES`). No hay consumidores externos, así que se pueden renombrar — pero **los dos lados en el mismo commit**.

### Cómo partirlo

En tajadas que compilen y pasen los tests cada una. Nunca de una.

1. **Códigos de error + enums** (back y front juntos). Contrato chico y aislado.
2. **Backend por capa**, de adentro hacia afuera: `utils` → `clients` → `repositories` → `services` → `routes`. Cada una es puro TypeScript, o sea que el compilador verifica el rename entero. Cero riesgo de datos.
3. **Frontend**: `types` → `api` → `hooks` → `components` → `pages`.
4. **Prisma al final, en su propio commit.** Es lo único que toca datos; aislarlo hace que un `git revert` sea suficiente si algo sale mal.

### Glosario a fijar antes de empezar

Decidirlo una vez y escribirlo acá evita que el repo termine con tres traducciones del mismo concepto:

| Español | Inglés | Nota |
|---|---|---|
| Licitación | `Tender` | El término estándar en compras públicas |
| Organismo | `Agency` / `BuyerAgency` | El comprador estatal |
| Perfil de empresa | `CompanyProfile` | |
| Matching | `Matching` | Ya está en inglés |
| Puntaje / Recomendación | `Score` / `Recommendation` | |
| Proceso / Corrida | `Process` / `Run` | `ProcesoRun` → `ProcessRun` |
| Pendientes | `Pending` | |
| UNSPSC | `UNSPSC` | Estándar internacional, no se toca |

## 4. README bilingüe

- `README.md` en inglés (es lo que GitHub muestra por defecto).
- `README.es.md` en español, enlazado desde la primera línea del inglés y viceversa.
- Convención habitual en GitHub: `README.<lang>.md`.

El costo honesto: pasan a ser dos archivos que se desincronizan. Se mitiga porque el README ya se comprimió a ~1.280 palabras y porque la mayor parte (comandos, tablas de scripts) es idéntica en los dos idiomas.

---

## Fuera de alcance

Anotado para que se note que es decisión y no olvido:

- **Auth, multi-usuario, deploy.** La app es mono-usuario y local a propósito; el lock en memoria y el barrido de huérfanos del arranque asumen una sola instancia, y está documentado en `PLAN.md`.
- **E2E en CI.** Ver el paso 1.
- **Traducir `PLAN.md`.** Ver el paso 3.
