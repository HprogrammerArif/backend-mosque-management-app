import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config/env.js';
import { OraclePool } from './infrastructure/database/oracle.pool.js';
import { Migrator } from './infrastructure/database/migrator.js';
import { OracleUserRepository } from './infrastructure/repositories/oracle/oracle-user.repository.js';
import { OracleTokenRepository } from './infrastructure/repositories/oracle/oracle-token.repository.js';
import { PasswordService } from './modules/auth/password.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { MemoryIdempotencyStore } from './middleware/require-idempotency.js';
import { assertRouteTableIsSound } from './middleware/assert-routes.js';
import { Router } from './http/router.js';
import { createHttpServer } from './http/server.js';

const here = dirname(fileURLToPath(import.meta.url));

export async function createApp() {
  const env = loadEnv();

  // ── infrastructure ──────────────────────────────────────────────────────
  const pool = new OraclePool(env);
  await pool.init();
  const migrator = new Migrator(pool, join(here, 'infrastructure/database/migrations/oracle'));

  // ── repositories ────────────────────────────────────────────────────────
  const users  = new OracleUserRepository(pool);
  const tokens = new OracleTokenRepository(pool);

  // ── services ────────────────────────────────────────────────────────────
  const passwords   = new PasswordService();
  const tokenSvc    = new TokenService(env, tokens);
  const authSvc     = new AuthService(users, passwords, tokenSvc, pool);
  const idempotency = new MemoryIdempotencyStore();

  // ── routes ──────────────────────────────────────────────────────────────
  const router = new Router();
  for (const route of [
    ...healthRoutes({ pool, migrator }),
    ...authRoutes({ auth: authSvc, tokens: tokenSvc, idempotency }),
  ]) router.add(route);

  assertRouteTableIsSound(router);   // refuses to boot on a forgotten guard

  const { server, shutdown } = createHttpServer(router, { log: console });
  return { server, shutdown, router, pool, migrator, env };
}

async function bootstrap(): Promise<void> {
  const app = await createApp();

  const pending = await app.migrator.pendingCount();
  if (pending > 0) {
    throw new Error(`Refusing to start: ${pending} unapplied migration(s). Run pnpm migrate.`);
  }

  app.server.listen(app.env.PORT, '0.0.0.0', () => {
    console.log(`API listening on ${app.env.PORT}`);
  });

  process.on('SIGTERM', async () => {
    await app.shutdown();
    await app.pool.close();
    process.exit(0);
  });
}

if (process.env['VITEST'] === undefined) {
  await bootstrap();
}
