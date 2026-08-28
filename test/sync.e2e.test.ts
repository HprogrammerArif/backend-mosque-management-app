import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { uuidv7 } from 'uuidv7';
import { createApp } from '../src/main.js';
import type { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { resetAllTables } from './helpers/reset-all-tables.js';
import { createTenant, idem, type TenantFixture } from './helpers/fixtures.js';
import type { Server } from 'node:http';

let server: Server; let shutdown: () => Promise<void>; let pool: OraclePool;

beforeAll(async () => { ({ server, shutdown, pool } = await createApp()); });
afterAll(async () => { await shutdown(); await pool.close(); });
beforeEach(async () => { await resetAllTables(pool); });

const api = () => request(server);

// maxSafeChangeSeq (oracle-sync.repository.ts) excludes CHANGE_LOG rows younger than 1
// second — the pull safety-lag for the sequence-visibility gap (offline-sync-protocol.md
// §7). Pull tests that assert a just-pushed row IS visible must wait past that window.
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// 1100ms measured flaky under coverage instrumentation (extra latency per DB round trip
// eats into the margin past the hard 1000ms cutoff) — 1800ms leaves real headroom.
const PAST_SAFETY_LAG_MS = 1800;

// Sync routes carry no :mosqueId path segment (offline-sync-protocol.md §5) — tenantGuard
// falls back to X-Tenant-Id here, so every sync request needs it explicitly.
function auth(tenant: TenantFixture) {
  return { Authorization: `Bearer ${tenant.accessToken}`, 'X-Tenant-Id': tenant.mosqueId };
}

function householdMutation(overrides: Partial<Record<string, unknown>> = {}) {
  const entityId = uuidv7();
  return {
    mutationId: uuidv7(),
    entity: 'households' as const,
    entityId,
    op: 'insert' as const,
    hlc: `${Date.now()}:000000:device-1`,
    dependsOn: [],
    payload: {
      name: 'Rahman Household', addressLine1: null, area: null, phone: null,
      monthlyDuesMinor: 50000, exempt: false, joinedOn: null,
    },
    ...overrides,
  };
}

function donationMutation(fundId: string, overrides: Partial<Record<string, unknown>> = {}) {
  const entityId = uuidv7();
  return {
    mutationId: uuidv7(),
    entity: 'donations' as const,
    entityId,
    op: 'insert' as const,
    hlc: `${Date.now()}:000000:device-1`,
    dependsOn: [],
    payload: {
      fundId, amountMinor: 10000, currency: 'BDT', occurredOn: '2026-08-15',
      method: 'CASH', donorHouseholdId: null as string | null, donorName: 'Anon Donor',
      anonymous: false, receiptNo: null, note: null, adjustsId: null, adjustmentReason: null,
    },
    ...overrides,
  };
}

describe('sync bootstrap', () => {
  it('returns empty rows for a tenant with no data yet', async () => {
    const tenant = await createTenant(server);
    const res = await api().post('/api/v1/sync/bootstrap')
      .set(auth(tenant)).set(idem())
      .send({ entities: ['donations', 'households'] });

    expect(res.status).toBe(201);
    expect(res.body.entities.donations.rows).toEqual([]);
    expect(res.body.entities.households.rows).toEqual([]);
  });

  it('returns previously-pushed rows for both entities', async () => {
    const tenant = await createTenant(server);
    const hh = householdMutation();
    await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [hh] });
    await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [donationMutation(tenant.fundId)] });

    const res = await api().post('/api/v1/sync/bootstrap')
      .set(auth(tenant)).set(idem())
      .send({ entities: ['donations', 'households'] });

    expect(res.body.entities.households.rows).toHaveLength(1);
    expect(res.body.entities.households.rows[0].id).toBe(hh.entityId);
    expect(res.body.entities.donations.rows).toHaveLength(1);
  });
});

describe('sync push — households', () => {
  it('accepts a new household insert', async () => {
    const tenant = await createTenant(server);
    const mutation = householdMutation();
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(res.status).toBe(201);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0]).toMatchObject({
      mutationId: mutation.mutationId, status: 'accepted', changeSeq: expect.any(Number),
    });
    expect(res.body.results[0].canonical.name).toBe('Rahman Household');
  });

  it('deduplicates a retried mutation by mutationId, not by HTTP idempotency key', async () => {
    const tenant = await createTenant(server);
    const mutation = householdMutation();

    const first = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });
    // Deliberately a DIFFERENT Idempotency-Key — this must hit mutation-level dedup in
    // the sync service, not the HTTP layer's idempotency-key replay cache.
    const retry = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(first.body.results[0].status).toBe('accepted');
    expect(retry.body.results[0].status).toBe('duplicate');
    expect(retry.body.results[0].changeSeq).toBe(first.body.results[0].changeSeq);

    const list = await api().get(`/api/v1/mosques/${tenant.mosqueId}/households`).set(auth(tenant));
    expect(list.body).toHaveLength(1);
  });

  it('rejects a non-insert op — field-merge is a named, not-yet-built gap', async () => {
    const tenant = await createTenant(server);
    const mutation = householdMutation({ op: 'update' });
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(res.body.results[0]).toMatchObject({ status: 'rejected', code: 'VALIDATION_FAILED' });
  });
});

describe('sync push — donations', () => {
  it('accepts a donation with no dependency', async () => {
    const tenant = await createTenant(server);
    const mutation = donationMutation(tenant.fundId);
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(res.body.results[0].status).toBe('accepted');
    expect(res.body.results[0].canonical.amountMinor).toBe(10000);
  });

  it('deduplicates a retried donation mutation by mutationId', async () => {
    const tenant = await createTenant(server);
    const mutation = donationMutation(tenant.fundId);

    const first = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });
    const retry = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(first.body.results[0].status).toBe('accepted');
    expect(retry.body.results[0]).toMatchObject({
      status: 'duplicate', changeSeq: first.body.results[0].changeSeq,
    });
    expect(retry.body.results[0].canonical.amountMinor).toBe(10000);
  });

  it('rejects a non-insert op — donations are append-only', async () => {
    const tenant = await createTenant(server);
    const mutation = donationMutation(tenant.fundId, { op: 'delete' });
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(res.body.results[0]).toMatchObject({ status: 'rejected', code: 'VALIDATION_FAILED' });
  });

  it('rejects a donation depending on a household that does not exist anywhere', async () => {
    const tenant = await createTenant(server);
    const ghostHouseholdId = uuidv7();
    const mutation = donationMutation(tenant.fundId, { dependsOn: [ghostHouseholdId] });
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(res.body.results[0]).toMatchObject({
      mutationId: mutation.mutationId, status: 'rejected', code: 'SYNC_DEPENDENCY_NOT_FOUND',
    });
  });

  it('accepts a donation depending on a household created earlier in the SAME batch', async () => {
    const tenant = await createTenant(server);
    const hh = householdMutation();
    const donation = donationMutation(tenant.fundId, { dependsOn: [hh.entityId] });
    donation.payload.donorHouseholdId = hh.entityId;

    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [hh, donation] });

    expect(res.body.results[0].status).toBe('accepted');
    expect(res.body.results[1].status).toBe('accepted');
    expect(res.body.results[1].canonical.donorHouseholdId).toBe(hh.entityId);
  });

  it('accepts a donation depending on a household from an EARLIER request', async () => {
    const tenant = await createTenant(server);
    const hh = householdMutation();
    await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [hh] });

    const donation = donationMutation(tenant.fundId, { dependsOn: [hh.entityId] });
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [donation] });

    expect(res.body.results[0].status).toBe('accepted');
  });
});

describe('sync pull', () => {
  it('returns nothing new when the cursor is already caught up', async () => {
    const tenant = await createTenant(server);
    const push = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [donationMutation(tenant.fundId)] });
    const cursor = push.body.cursor as number;

    const res = await api().get(`/api/v1/sync/pull?entities=donations&since=${cursor}`).set(auth(tenant));
    expect(res.body.changes.donations.rows).toEqual([]);
  });

  it('hides a just-pushed row until the safety-lag window passes', async () => {
    const tenant = await createTenant(server);
    await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [donationMutation(tenant.fundId)] });

    const immediately = await api().get('/api/v1/sync/pull?entities=donations&since=0').set(auth(tenant));
    expect(immediately.body.changes.donations.rows).toEqual([]);
  }, 10_000);

  it('returns rows pushed after the given cursor, once the safety lag has passed, and advances the cursor', async () => {
    const tenant = await createTenant(server);
    const res = await api().get('/api/v1/sync/pull?entities=donations&since=0').set(auth(tenant));
    expect(res.body.changes.donations.rows).toEqual([]);

    const push = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [donationMutation(tenant.fundId)] });
    await sleep(PAST_SAFETY_LAG_MS);

    const after = await api().get('/api/v1/sync/pull?entities=donations&since=0').set(auth(tenant));
    expect(after.body.changes.donations.rows).toHaveLength(1);
    expect(after.body.changes.donations.cursor).toBe(push.body.cursor);
  }, 10_000);

  it('sets hasMore when more rows exist than the page limit', async () => {
    const tenant = await createTenant(server);
    const mutations = Array.from({ length: 3 }, () => donationMutation(tenant.fundId));
    await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations });
    await sleep(PAST_SAFETY_LAG_MS);

    const res = await api().get('/api/v1/sync/pull?entities=donations&since=0&limit=2').set(auth(tenant));
    expect(res.body.changes.donations.rows).toHaveLength(2);
    expect(res.body.changes.donations.hasMore).toBe(true);
  }, 10_000);

  it('pulls both entities in one call when both are requested', async () => {
    const tenant = await createTenant(server);
    await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [householdMutation(), donationMutation(tenant.fundId)] });
    await sleep(PAST_SAFETY_LAG_MS);

    const res = await api().get('/api/v1/sync/pull?entities=donations,households&since=0').set(auth(tenant));
    expect(res.body.changes.donations.rows).toHaveLength(1);
    expect(res.body.changes.households.rows).toHaveLength(1);
  }, 10_000);
});

describe('sync multi-tenant isolation', () => {
  it('never returns another mosque\'s rows via bootstrap or pull', async () => {
    const tenantA = await createTenant(server);
    const tenantB = await createTenant(server);

    await api().post('/api/v1/sync/push').set(auth(tenantA)).set(idem())
      .send({ deviceId: 'device-1', mutations: [donationMutation(tenantA.fundId)] });

    const bootstrapB = await api().post('/api/v1/sync/bootstrap').set(auth(tenantB)).set(idem())
      .send({ entities: ['donations'] });
    expect(bootstrapB.body.entities.donations.rows).toEqual([]);

    const pullB = await api().get('/api/v1/sync/pull?entities=donations&since=0').set(auth(tenantB));
    expect(pullB.body.changes.donations.rows).toEqual([]);
  });
});
