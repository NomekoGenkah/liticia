// Se ejecuta antes de importar cualquier módulo de test. Inyecta las variables mínimas
// que src/config/env.ts exige, para que su validación pase sin llamar a process.exit(1)
// en entornos sin .env (CI). Los tests siguen mockeando repos, Ollama y ChileCompra:
// estos valores son dummies, no se usa infra real.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.CHILECOMPRA_TICKET ??= "test-ticket";
process.env.CHILECOMPRA_API_BASE ??= "https://api.test.local";
