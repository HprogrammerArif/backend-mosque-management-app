import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/main.js';
import type { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { resetAllTables } from './helpers/reset-all-tables.js';
import type { Server } from 'node:http';

let server: Server; let shutdown: () => Promise<void>; let pool: OraclePool;

const device = { id: '01J9DEVICE0000000000000001', platform: 'ANDROID', model: 'SM-A155F' };
const credentials = { phone: '+8801712345678', password: 'correct-horse-battery',
                      displayName: 'Kamal Hossain', locale: 'bn' };

beforeAll(async () => { ({ server, shutdown, pool } = await createApp()); });
afterAll(async () => { await shutdown(); await pool.close(); });

beforeEach(async () => { await resetAllTables(pool); });

const api = () => request(server);
const idem = () => ({ 'Idempotency-Key': crypto.randomUUID() });

describe('auth', () => {
  it('reports health and readiness', async () => {
    expect((await api().get('/health')).body.status).toBe('ok');
    const ready = await api().get('/ready');
    expect(ready.body.database).toBe('ok');
    expect(ready.body.pendingMigrations).toBe(0);
  });

  it('registers a user and returns tokens', async () => {
    const res = await api().post('/api/v1/auth/register').send(credentials);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toMatch(/^rt_/);
    expect(res.body.user.displayName).toBe('Kamal Hossain');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate phone number', async () => {
    await api().post('/api/v1/auth/register').send(credentials);
    const res = await api().post('/api/v1/auth/register').send(credentials);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AUTH_PHONE_TAKEN');
  });

  it('rejects a short password with field detail', async () => {
    const res = await api().post('/api/v1/auth/register')
      .send({ ...credentials, password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields).toHaveProperty('password');
  });

  it('signs in with correct credentials', async () => {
    await api().post('/api/v1/auth/register').send(credentials);
    const res = await api().post('/api/v1/auth/login')
      .send({ identifier: credentials.phone, password: credentials.password, device });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('gives an identical response for a wrong password and an unknown user', async () => {
    await api().post('/api/v1/auth/register').send(credentials);
    const wrong = await api().post('/api/v1/auth/login')
      .send({ identifier: credentials.phone, password: 'nope', device });
    const unknown = await api().post('/api/v1/auth/login')
      .send({ identifier: '+8809999999999', password: 'nope', device });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe(unknown.body.error.code);
  });

  it('refreshes and rotates', async () => {
    await api().post('/api/v1/auth/register').send(credentials);
    const login = await api().post('/api/v1/auth/login')
      .send({ identifier: credentials.phone, password: credentials.password, device });

    const res = await api().post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken, deviceId: device.id });

    expect(res.status).toBe(201);
    expect(res.body.refreshToken).not.toBe(login.body.refreshToken);
  });

  it('returns the current user for a valid access token', async () => {
    const reg = await api().post('/api/v1/auth/register').send(credentials);
    const res = await api().get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe(credentials.phone);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects /auth/me without a token', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
  });

  it('kills the session on logout', async () => {
    const reg = await api().post('/api/v1/auth/register').send(credentials);
    await api().post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${reg.body.accessToken}`).set(idem())
      .send({ refreshToken: reg.body.refreshToken });

    const res = await api().post('/api/v1/auth/refresh')
      .send({ refreshToken: reg.body.refreshToken, deviceId: 'bootstrap' });
    expect(res.status).toBe(401);
  });
});
