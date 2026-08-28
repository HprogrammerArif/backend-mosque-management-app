import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { z } from 'zod';
import type { Server } from 'node:http';
import { Router } from '../src/http/router.js';
import { createHttpServer } from '../src/http/server.js';
import { createRequireAuth } from '../src/middleware/require-auth.js';
import { validate } from '../src/middleware/validate.js';
import { createRequireIdempotency, MemoryIdempotencyStore } from '../src/middleware/require-idempotency.js';
import { mustUser } from '../src/http/context.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { OracleTokenRepository } from '../src/infrastructure/repositories/oracle/oracle-token.repository.js';
import { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { loadEnv } from '../src/config/env.js';
import { resetAllTables } from './helpers/reset-all-tables.js';

let pool: OraclePool; let server: Server; let shutdown: () => Promise<void>;
let tokens: TokenService; let accessToken: string;

beforeAll(async () => {
  pool = new OraclePool(loadEnv());
  await pool.init();
  tokens = new TokenService(loadEnv(), new OracleTokenRepository(pool));

  await resetAllTables(pool);
  await pool.execute('INSERT INTO USERS (ID,PHONE,PASSWORD_HASH,DISPLAY_NAME) VALUES (:i,:p,:h,:n)',
    { i: 'u-mw', p: '+8801700000055', h: 'x', n: 'MW Test' });
  await pool.execute('INSERT INTO DEVICES (ID,USER_ID,PLATFORM) VALUES (:i,:u,:p)',
    { i: 'd-mw', u: 'u-mw', p: 'ANDROID' });
  ({ accessToken } = await tokens.issue('u-mw', 'd-mw'));

  const router = new Router();
  router.add({ method: 'GET', path: '/whoami', permission: 'AUTHENTICATED',
    middleware: [createRequireAuth(tokens)], handler: (ctx) => ({ sub: mustUser(ctx).sub }) });
  router.add({ method: 'POST', path: '/validated', permission: 'PUBLIC',
    middleware: [validate({ body: z.object({ amountMinor: z.number().int() }) })],
    handler: (ctx) => ctx.body });
  router.add({ method: 'POST', path: '/once', permission: 'AUTHENTICATED',
    middleware: [createRequireAuth(tokens), createRequireIdempotency(new MemoryIdempotencyStore())],
    handler: () => ({ id: Math.random().toString(36).slice(2) }) });

  ({ server, shutdown } = createHttpServer(router, {}));
});
afterAll(async () => { await shutdown(); await pool.close(); });

describe('middleware', () => {
  it('populates ctx.user from a valid token', async () => {
    const res = await request(server).get('/whoami').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.sub).toBe('u-mw');
  });

  it('rejects a missing token', async () => {
    const res = await request(server).get('/whoami');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('rejects a tampered token', async () => {
    const res = await request(server).get('/whoami').set('Authorization', `Bearer ${accessToken}x`);
    expect(res.status).toBe(401);
  });

  it('accepts a valid body and strips unknown properties', async () => {
    const res = await request(server).post('/validated').send({ amountMinor: 500, sneaky: true });
    expect(res.body).toEqual({ amountMinor: 500 });
  });

  it('rejects an invalid body with a field map', async () => {
    const res = await request(server).post('/validated').send({ amountMinor: 'lots' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields).toHaveProperty('amountMinor');
  });

  it('replays the stored response for a repeated idempotency key', async () => {
    const key = 'idem-key-1';
    const first = await request(server).post('/once')
      .set('Authorization', `Bearer ${accessToken}`).set('Idempotency-Key', key).send({});
    const second = await request(server).post('/once')
      .set('Authorization', `Bearer ${accessToken}`).set('Idempotency-Key', key).send({});

    expect(second.body).toEqual(first.body);
    expect(second.headers['idempotency-replayed']).toBe('true');
  });

  it('requires an idempotency key on a guarded mutation', async () => {
    const res = await request(server).post('/once')
      .set('Authorization', `Bearer ${accessToken}`).send({});
    expect(res.status).toBe(400);
  });
});
