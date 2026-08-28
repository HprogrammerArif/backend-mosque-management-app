import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './config/env.js';
import { OraclePool } from './infrastructure/database/oracle.pool.js';
import { Migrator } from './infrastructure/database/migrator.js';
import { OracleUserRepository } from './infrastructure/repositories/oracle/oracle-user.repository.js';
import { OracleTokenRepository } from './infrastructure/repositories/oracle/oracle-token.repository.js';
import { OracleMosqueRepository } from './infrastructure/repositories/oracle/oracle-mosque.repository.js';
import { OracleMembershipRepository } from './infrastructure/repositories/oracle/oracle-membership.repository.js';
import { OracleInvitationRepository } from './infrastructure/repositories/oracle/oracle-invitation.repository.js';
import { PasswordService } from './modules/auth/password.service.js';
import { TokenService } from './modules/auth/token.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { MosquesService } from './modules/mosques/mosques.service.js';
import { mosquesRoutes } from './modules/mosques/mosques.routes.js';
import { InvitationsService } from './modules/mosques/invitations.service.js';
import { invitationsRoutes } from './modules/mosques/invitations.routes.js';
import { PrayerConfigService } from './modules/mosques/prayer-config.service.js';
import { prayerConfigRoutes } from './modules/mosques/prayer-config.routes.js';
import { HouseholdsService } from './modules/households/households.service.js';
import { householdsRoutes } from './modules/households/households.routes.js';
import { DonationsService } from './modules/donations/donations.service.js';
import { donationsRoutes } from './modules/donations/donations.routes.js';
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
  const users       = new OracleUserRepository(pool);
  const tokens      = new OracleTokenRepository(pool);
  const mosques     = new OracleMosqueRepository(pool);
  const memberships = new OracleMembershipRepository(pool);
  const invitations = new OracleInvitationRepository(pool);

  // ── services ────────────────────────────────────────────────────────────
  const passwords     = new PasswordService();
  const tokenSvc      = new TokenService(env, tokens);
  const authSvc       = new AuthService(users, passwords, tokenSvc, pool);
  const mosquesSvc      = new MosquesService(pool, mosques, memberships);
  const invitationsSvc  = new InvitationsService(invitations, memberships);
  const prayerConfigSvc = new PrayerConfigService(pool);
  const householdsSvc   = new HouseholdsService(pool);
  const donationsSvc    = new DonationsService(pool);
  const idempotency     = new MemoryIdempotencyStore();

  // ── routes ──────────────────────────────────────────────────────────────
  const router = new Router();
  for (const route of [
    ...healthRoutes({ pool, migrator }),
    ...authRoutes({ auth: authSvc, tokens: tokenSvc, idempotency }),
    ...mosquesRoutes({ mosques: mosquesSvc, tokens: tokenSvc, memberships, idempotency }),
    ...invitationsRoutes({ invitations: invitationsSvc, tokens: tokenSvc, memberships, idempotency }),
    ...prayerConfigRoutes({ prayerConfig: prayerConfigSvc, tokens: tokenSvc, memberships, idempotency }),
    ...householdsRoutes({ households: householdsSvc, tokens: tokenSvc, memberships, idempotency }),
    ...donationsRoutes({ donations: donationsSvc, tokens: tokenSvc, memberships, idempotency }),
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

/**
 * Only bootstrap when this file is executed directly (`pnpm dev`, `node dist/main.js`),
 * never when it is imported for its `createApp` export.
 *
 * An earlier version guarded this with `process.env.VITEST === undefined`, which only
 * accounts for one specific importer (the test runner). `scripts/generate-openapi.ts`
 * imports this module dynamically to reach `createApp`, is not running under Vitest, and
 * so tripped the guard — silently starting a full listening server as a side effect of
 * an import, which either hung the script (a real handle keeping the process alive) or
 * threw EADDRINUSE on a second run. Comparing `process.argv[1]` against this module's
 * own path is the general, environment-agnostic form of "am I the entry point" and
 * covers every importer, not just the ones anticipated in advance.
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await bootstrap();
}
