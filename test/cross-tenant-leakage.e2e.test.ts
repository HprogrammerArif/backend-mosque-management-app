import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/main.js';
import type { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { resetAllTables } from './helpers/reset-all-tables.js';
import { createTenant, idem, type TenantFixture } from './helpers/fixtures.js';
import type { Server } from 'node:http';

/**
 * The single highest-consequence correctness property of a shared-schema multi-tenant
 * app: mosque A's data must never surface through mosque B's own, correctly-scoped
 * queries. This exercises Layer 2 (Oracle VPD) directly — Layer 1 (application-level
 * TenantContext scoping) is what every module's own e2e tests already exercise by
 * construction, since they only ever query the mosque they created. This suite is the
 * one that would actually catch a VPD policy gap, a forgotten ADD_POLICY, or a
 * repository method that queries unscoped (exactly the class of bug `maxSafeChangeSeq`
 * had during Phase 2B — this suite is what should have caught that, had it existed then).
 */
let server: Server; let shutdown: () => Promise<void>; let pool: OraclePool;

beforeAll(async () => { ({ server, shutdown, pool } = await createApp()); });
afterAll(async () => { await shutdown(); await pool.close(); });
beforeEach(async () => { await resetAllTables(pool); });

const api = () => request(server);
const auth = (tenant: TenantFixture) => ({ Authorization: `Bearer ${tenant.accessToken}` });

/** Two independent tenants, A with one record seeded in every major module. */
async function seedTwoTenants() {
  const a = await createTenant(server);
  const b = await createTenant(server);

  const household = await api().post(`/api/v1/mosques/${a.mosqueId}/households`)
    .set(auth(a)).set(idem())
    .send({ name: 'Rahman Household', monthlyDuesMinor: 50000 });

  await api().post(`/api/v1/mosques/${a.mosqueId}/donations`)
    .set(auth(a)).set(idem())
    .send({ fundId: a.fundId, amountMinor: 10000, occurredOn: '2026-08-15', method: 'CASH' });

  await api().post(`/api/v1/mosques/${a.mosqueId}/expenses`)
    .set(auth(a)).set(idem())
    .send({
      fundId: a.fundId, categoryId: a.expenseCategoryId, amountMinor: 5000,
      occurredOn: '2026-08-15', method: 'CASH',
    });

  await api().post(`/api/v1/mosques/${a.mosqueId}/dues/generate`)
    .set(auth(a)).set(idem())
    .send({ period: '2026-08' });

  await api().post(`/api/v1/mosques/${a.mosqueId}/staff`)
    .set(auth(a)).set(idem())
    .send({ name: 'Imam Karim', monthlySalaryMinor: 3000000 });

  await api().post(`/api/v1/mosques/${a.mosqueId}/committee`)
    .set(auth(a)).set(idem())
    .send({ name: 'Abdul Malik', position: 'Chairperson' });

  await api().post(`/api/v1/mosques/${a.mosqueId}/events`)
    .set(auth(a)).set(idem())
    .send({ title: 'Jumu\'ah Lecture', startsAt: '2026-09-04T13:00:00Z' });

  await api().post(`/api/v1/mosques/${a.mosqueId}/announcements`)
    .set(auth(a)).set(idem())
    .send({ title: 'Ramadan schedule', body: 'See the notice board.' });

  return { a, b, householdId: household.body.id as string };
}

describe('cross-tenant leakage — VPD isolation', () => {
  it('never leaks households into another tenant\'s own list', async () => {
    const { b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/households`).set(auth(b));
    expect(res.body).toEqual([]);
  });

  it('never leaks donations into another tenant\'s own list or balance', async () => {
    const { b } = await seedTwoTenants();
    const list = await api().get(`/api/v1/mosques/${b.mosqueId}/donations`).set(auth(b));
    expect(list.body).toEqual([]);
    const balance = await api().get(`/api/v1/mosques/${b.mosqueId}/donations/balance`).set(auth(b));
    expect((balance.body as { totalMinor: number }[]).every((row) => row.totalMinor === 0)).toBe(true);
  });

  it('never leaks expenses into another tenant\'s own list', async () => {
    const { b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/expenses`).set(auth(b));
    expect(res.body).toEqual([]);
  });

  it('never leaks dues charges into another tenant\'s own list for the same period', async () => {
    const { b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/dues/charges?period=2026-08`).set(auth(b));
    expect(res.body).toEqual([]);
  });

  it('never leaks staff into another tenant\'s own list', async () => {
    const { b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/staff`).set(auth(b));
    expect(res.body).toEqual([]);
  });

  it('never leaks committee members into another tenant\'s own list', async () => {
    const { b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/committee`).set(auth(b));
    expect(res.body).toEqual([]);
  });

  it('never leaks events into another tenant\'s own upcoming list', async () => {
    const { b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/events`).set(auth(b));
    expect(res.body).toEqual([]);
  });

  it('never leaks announcements into another tenant\'s own list', async () => {
    const { b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/announcements`).set(auth(b));
    expect(res.body).toEqual([]);
  });

  it('never returns another tenant\'s fund ids — each mosque has its own seeded set', async () => {
    const { a, b } = await seedTwoTenants();
    const fundsA = await api().get(`/api/v1/mosques/${a.mosqueId}/funds`).set(auth(a));
    const fundsB = await api().get(`/api/v1/mosques/${b.mosqueId}/funds`).set(auth(b));
    const idsA = new Set((fundsA.body as { id: string }[]).map((f) => f.id));
    const idsB = new Set((fundsB.body as { id: string }[]).map((f) => f.id));
    expect([...idsA].some((id) => idsB.has(id))).toBe(false);
  });

  it('refuses B setting a corpus on A\'s WAQF fund by id (BR-2 across the tenant boundary)', async () => {
    const { a, b } = await seedTwoTenants();
    const fundsA = await api().get(`/api/v1/mosques/${a.mosqueId}/funds`).set(auth(a));
    const waqfA = (fundsA.body as { id: string; type: string }[]).find((f) => f.type === 'WAQF');
    if (!waqfA) throw new Error('Tenant A has no seeded WAQF fund');

    // B is a real Admin — just not of mosque A. Same 404-not-leak shape as the
    // household-by-id case above: B's own path, A's fund id.
    const res = await api().patch(`/api/v1/mosques/${b.mosqueId}/funds/${waqfA.id}/corpus`)
      .set(auth(b)).set(idem())
      .send({ corpusMinor: 1, reason: 'Attempted cross-tenant corpus tamper' });

    expect(res.status).toBe(404);
  });

  it('404s, not 200-with-data, when B fetches A\'s household by id through B\'s own membership boundary', async () => {
    const { a, b, householdId } = await seedTwoTenants();
    // B is a real, active member of mosque B — tenantGuard passes on the :mosqueId in
    // the path. The record id belongs to A. VPD must still hide it under B's context.
    const res = await api().get(`/api/v1/mosques/${b.mosqueId}/households/${householdId}`).set(auth(b));
    expect(res.status).toBe(404);
    // Sanity check the same id genuinely exists and is readable under A's own context.
    const ownRes = await api().get(`/api/v1/mosques/${a.mosqueId}/households/${householdId}`).set(auth(a));
    expect(ownRes.status).toBe(200);
  });

  it('rejects B calling A\'s mosque path outright — no active membership', async () => {
    const { a, b } = await seedTwoTenants();
    const res = await api().get(`/api/v1/mosques/${a.mosqueId}/households`).set(auth(b));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PERM_DENIED');
  });
});
