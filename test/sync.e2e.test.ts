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

  it('rejects a delete op — soft-delete via sync is a separate, not-yet-built gap', async () => {
    const tenant = await createTenant(server);
    const mutation = householdMutation({ op: 'delete' });
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(res.body.results[0]).toMatchObject({ status: 'rejected', code: 'VALIDATION_FAILED' });
  });

  it('rejects an update to a household that does not exist', async () => {
    const tenant = await createTenant(server);
    const mutation = householdMutation({ op: 'update' });
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(res.body.results[0]).toMatchObject({ status: 'rejected', code: 'NOT_FOUND' });
  });
});

describe('sync push — household field-merge (offline-sync-protocol.md §6.2)', () => {
  async function insertHousehold(tenant: TenantFixture, overrides: Partial<Record<string, unknown>> = {}) {
    const mutation = householdMutation(overrides);
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });
    return { entityId: mutation.entityId, accepted: res.body.results[0] };
  }

  function updateMutation(
    entityId: string, hlc: string, changedFields: string[], payloadOverrides: Partial<Record<string, unknown>>,
  ) {
    return {
      mutationId: uuidv7(), entity: 'households' as const, entityId, op: 'update' as const,
      hlc, dependsOn: [], changedFields,
      payload: {
        name: 'Rahman Household', addressLine1: null, area: null, phone: null,
        monthlyDuesMinor: 50000, exempt: false, joinedOn: null,
        ...payloadOverrides,
      },
    };
  }

  it('accepts a single-device update where every changed field wins — status "accepted", not "conflict"', async () => {
    const tenant = await createTenant(server);
    const { entityId } = await insertHousehold(tenant);
    const laterHlc = `${Date.now() + 60_000}:000000:device-1`;

    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [updateMutation(entityId, laterHlc, ['area'], { area: 'Mirpur' })] });

    expect(res.body.results[0].status).toBe('accepted');
    expect(res.body.results[0].canonical.area).toBe('Mirpur');

    const fetched = await api().get(`/api/v1/mosques/${tenant.mosqueId}/households/${entityId}`).set(auth(tenant));
    expect(fetched.body.area).toBe('Mirpur');
  });

  it('rejects a stale update (older HLC than the field already has) as a no-op conflict, not an error', async () => {
    const tenant = await createTenant(server);
    const { entityId } = await insertHousehold(tenant);
    // The insert stamped every field with a SERVER clock at "now" — an update whose hlc
    // is from far in the past must lose on the field it's trying to change.
    const staleHlc = '000000000000001:000000:device-1';

    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [updateMutation(entityId, staleHlc, ['area'], { area: 'Mirpur' })] });

    expect(res.body.results[0]).toMatchObject({ status: 'conflict', resolution: 'field_merge' });
    // The server's existing value survives — the stale write never applied.
    expect(res.body.results[0].canonical.area).toBeNull();

    const fetched = await api().get(`/api/v1/mosques/${tenant.mosqueId}/households/${entityId}`).set(auth(tenant));
    expect(fetched.body.area).toBeNull();
  });

  it('merges two devices\' concurrent edits to DIFFERENT fields — both survive regardless of clock order', async () => {
    const tenant = await createTenant(server);
    const { entityId } = await insertHousehold(tenant);
    const t1 = `${Date.now() + 60_000}:000000:device-A`;
    // Device B's clock is actually EARLIER than A's — if changedFields scoping were
    // missing, this ordering would be the tell: without it, whichever mutation's blanket
    // clock is later would win on every field, including ones it never intended to touch.
    const t2 = `${Date.now() + 30_000}:000000:device-B`;

    // Device A, offline, changes only the phone number and explicitly says so.
    await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-A', mutations: [updateMutation(entityId, t1, ['phone'], { phone: '+8801711111111' })] });

    // Device B, offline, changes only the area. Its payload still carries the OLD phone
    // value (it never saw A's edit) — changedFields: ['area'] is what stops that stale
    // phone field from being considered at all, let alone overwriting A's write.
    const res = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-B', mutations: [updateMutation(entityId, t2, ['area'], { area: 'Uttara' })] });

    expect(res.body.results[0]).toMatchObject({ status: 'accepted' });
    expect(res.body.results[0].canonical.area).toBe('Uttara');
    expect(res.body.results[0].canonical.phone).toBe('+8801711111111');

    const fetched = await api().get(`/api/v1/mosques/${tenant.mosqueId}/households/${entityId}`).set(auth(tenant));
    expect(fetched.body.area).toBe('Uttara');
    expect(fetched.body.phone).toBe('+8801711111111');
  });

  it('increments serverVersion on each successive update, persisted not just reported', async () => {
    const tenant = await createTenant(server);
    const inserted = await insertHousehold(tenant);
    expect(inserted.accepted.serverVersion).toBe(1);

    const first = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({
        deviceId: 'device-1',
        mutations: [updateMutation(inserted.entityId, `${Date.now() + 60_000}:000000:device-1`, ['area'], { area: 'Mirpur' })],
      });
    expect(first.body.results[0].serverVersion).toBe(2);

    // A SECOND update must see 3, not 2 again — if SERVER_VERSION were computed from a
    // stale in-memory value rather than the row NVL-incremented in the same UPDATE
    // statement, every update after the first would keep reporting 2.
    const second = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({
        deviceId: 'device-1',
        mutations: [updateMutation(inserted.entityId, `${Date.now() + 120_000}:000000:device-1`, ['area'], { area: 'Uttara' })],
      });
    expect(second.body.results[0].serverVersion).toBe(3);
  });

  it('deduplicates a retried update mutation by mutationId', async () => {
    const tenant = await createTenant(server);
    const { entityId } = await insertHousehold(tenant);
    const mutation = updateMutation(entityId, `${Date.now() + 60_000}:000000:device-1`, ['area'], { area: 'Badda' });

    const first = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });
    const retry = await api().post('/api/v1/sync/push').set(auth(tenant)).set(idem())
      .send({ deviceId: 'device-1', mutations: [mutation] });

    expect(first.body.results[0].status).toBe('accepted');
    expect(retry.body.results[0]).toMatchObject({ status: 'duplicate', changeSeq: first.body.results[0].changeSeq });
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
