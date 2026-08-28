import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
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
const auth = (tenant: TenantFixture) => ({ Authorization: `Bearer ${tenant.accessToken}` });

describe('Statistics', () => {
  it('income-expenditure nets donations against expenses for the given date range', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 30000, occurredOn: '2026-08-10', method: 'CASH' });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/expenses`)
      .set(auth(tenant)).set(idem())
      .send({
        fundId: tenant.fundId, categoryId: tenant.expenseCategoryId, amountMinor: 12000,
        occurredOn: '2026-08-12', method: 'CASH',
      });
    // Outside the queried range — must not affect the total.
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 99999, occurredOn: '2026-01-01', method: 'CASH' });

    const res = await api()
      .get(`/api/v1/mosques/${tenant.mosqueId}/statistics/income-expenditure?from=2026-08-01&to=2026-08-31`)
      .set(auth(tenant));

    expect(res.body).toMatchObject({ incomeMinor: 30000, expenditureMinor: 12000, netMinor: 18000 });
  });

  it('fund-balances nets donations minus expenses per fund', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 20000, occurredOn: '2026-08-10', method: 'CASH' });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/expenses`)
      .set(auth(tenant)).set(idem())
      .send({
        fundId: tenant.fundId, categoryId: tenant.expenseCategoryId, amountMinor: 7000,
        occurredOn: '2026-08-12', method: 'CASH',
      });

    const res = await api().get(`/api/v1/mosques/${tenant.mosqueId}/statistics/fund-balances`).set(auth(tenant));
    const fund = (res.body as { fundId: string; balanceMinor: number }[]).find((f) => f.fundId === tenant.fundId);
    expect(fund?.balanceMinor).toBe(13000);
  });

  it('donation-trends: months=N means the last N calendar months, not N+1 (regression for the live-caught off-by-one)', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 5000, occurredOn: '2026-08-15', method: 'CASH' });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 7000, occurredOn: '2026-07-10', method: 'CASH' });

    const oneMonth = await api()
      .get(`/api/v1/mosques/${tenant.mosqueId}/statistics/donation-trends?months=1`).set(auth(tenant));
    const periods1 = (oneMonth.body as { period: string }[]).map((p) => p.period);
    expect(periods1).not.toContain('2026-07');

    const twoMonths = await api()
      .get(`/api/v1/mosques/${tenant.mosqueId}/statistics/donation-trends?months=2`).set(auth(tenant));
    const periods2 = (twoMonths.body as { period: string }[]).map((p) => p.period);
    expect(periods2).toEqual(expect.arrayContaining(['2026-07']));
  });
});

describe('Payroll — full lifecycle on the PRO plan', () => {
  it('generates, reviews, and posts a run, producing correct EXPENSE rows', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/billing/mock-set-plan`)
      .set(auth(tenant)).set(idem()).send({ planCode: 'PRO' });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/staff`)
      .set(auth(tenant)).set(idem()).send({ name: 'Muezzin Yusuf', monthlySalaryMinor: 1500000 });

    const run = await api().post(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs`)
      .set(auth(tenant)).set(idem()).send({ period: '2026-08', fundId: tenant.fundId });
    expect(run.body.status).toBe('DRAFT');

    const lines = await api().get(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs/${run.body.id}/lines`).set(auth(tenant));
    expect(lines.body).toHaveLength(1);
    expect(lines.body[0].expenseId).toBeNull();

    const posted = await api().post(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs/${run.body.id}/post`)
      .set(auth(tenant)).set(idem());
    expect(posted.status).toBe(201);
    expect(posted.body.status).toBe('POSTED');

    const linesAfter = await api().get(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs/${run.body.id}/lines`).set(auth(tenant));
    expect(linesAfter.body[0].expenseId).not.toBeNull();

    const expenses = await api().get(`/api/v1/mosques/${tenant.mosqueId}/expenses`).set(auth(tenant));
    expect((expenses.body as { amountMinor: number }[]).some((e) => e.amountMinor === 1500000)).toBe(true);
  });

  it('is idempotent per period — re-generating returns the same run rather than duplicating lines', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/billing/mock-set-plan`)
      .set(auth(tenant)).set(idem()).send({ planCode: 'PRO' });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/staff`)
      .set(auth(tenant)).set(idem()).send({ name: 'Muezzin Yusuf', monthlySalaryMinor: 1500000 });

    const first = await api().post(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs`)
      .set(auth(tenant)).set(idem()).send({ period: '2026-08', fundId: tenant.fundId });
    const second = await api().post(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs`)
      .set(auth(tenant)).set(idem()).send({ period: '2026-08', fundId: tenant.fundId });

    expect(second.body.id).toBe(first.body.id);
    const lines = await api().get(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs/${first.body.id}/lines`).set(auth(tenant));
    expect(lines.body).toHaveLength(1);
  });
});

describe('Individuals — household members', () => {
  it('adds a member to a household and lists them', async () => {
    const tenant = await createTenant(server);
    const household = await api().post(`/api/v1/mosques/${tenant.mosqueId}/households`)
      .set(auth(tenant)).set(idem()).send({ name: 'Rahman Household' });

    const add = await api().post(`/api/v1/mosques/${tenant.mosqueId}/households/${household.body.id}/individuals`)
      .set(auth(tenant)).set(idem())
      .send({ fullName: 'Karim Rahman', relation: 'HEAD' });
    expect(add.status).toBe(201);

    const list = await api()
      .get(`/api/v1/mosques/${tenant.mosqueId}/households/${household.body.id}/individuals`).set(auth(tenant));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].fullName).toBe('Karim Rahman');
  });
});

describe('Announcements', () => {
  it('lists newest-first, and the urgent flag round-trips correctly', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/announcements`)
      .set(auth(tenant)).set(idem())
      .send({ title: 'Routine notice', body: 'Nothing urgent.' });
    const urgent = await api().post(`/api/v1/mosques/${tenant.mosqueId}/announcements`)
      .set(auth(tenant)).set(idem())
      .send({ title: 'Janazah today', body: 'After Asr.', urgent: true });

    const list = await api().get(`/api/v1/mosques/${tenant.mosqueId}/announcements`).set(auth(tenant));
    expect(list.body[0].id).toBe(urgent.body.id);
    expect(list.body[0].urgent).toBe(true);
    expect(list.body[1].urgent).toBe(false);
  });
});

describe('Notification preferences', () => {
  it('returns defaults before any save, then persists an update', async () => {
    const tenant = await createTenant(server);
    const before = await api().get('/api/v1/me/notification-preferences').set(auth(tenant));
    expect(before.body).toMatchObject({ announcements: true, quietHoursStart: '22:00' });

    await api().put('/api/v1/me/notification-preferences').set(auth(tenant)).set(idem())
      .send({
        announcements: true, duesReminders: false, prayerReminders: true, events: false,
        quietHoursStart: '23:00', quietHoursEnd: '05:00',
      });

    const after = await api().get('/api/v1/me/notification-preferences').set(auth(tenant));
    expect(after.body).toMatchObject({ duesReminders: false, quietHoursStart: '23:00' });
  });
});
