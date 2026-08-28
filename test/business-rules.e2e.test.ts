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

async function fundByType(tenant: TenantFixture, type: string): Promise<string> {
  const res = await api().get(`/api/v1/mosques/${tenant.mosqueId}/funds`).set(auth(tenant));
  const fund = (res.body as { id: string; type: string }[]).find((f) => f.type === type);
  if (!fund) throw new Error(`No seeded fund of type ${type}`);
  return fund.id;
}

async function categoryByName(tenant: TenantFixture, name: string): Promise<string> {
  const res = await api().get(`/api/v1/mosques/${tenant.mosqueId}/expense-categories`).set(auth(tenant));
  const category = (res.body as { id: string; name: string }[]).find((c) => c.name === name);
  if (!category) throw new Error(`No seeded expense category named ${name}`);
  return category.id;
}

describe('BR-1 — Zakat fund restriction', () => {
  it('rejects an expense from the Zakat fund against a non-zakat-eligible category', async () => {
    const tenant = await createTenant(server);
    const zakatFundId = await fundByType(tenant, 'ZAKAT');
    const generalCategoryId = await categoryByName(tenant, 'General Expenses');

    const res = await api().post(`/api/v1/mosques/${tenant.mosqueId}/expenses`)
      .set(auth(tenant)).set(idem())
      .send({
        fundId: zakatFundId, categoryId: generalCategoryId, amountMinor: 5000,
        occurredOn: '2026-08-15', method: 'CASH',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RULE_FUND_RESTRICTION_VIOLATED');
  });

  it('accepts an expense from the Zakat fund against the zakat-eligible category', async () => {
    const tenant = await createTenant(server);
    const zakatFundId = await fundByType(tenant, 'ZAKAT');
    const zakatCategoryId = await categoryByName(tenant, 'Zakat Distribution');

    const res = await api().post(`/api/v1/mosques/${tenant.mosqueId}/expenses`)
      .set(auth(tenant)).set(idem())
      .send({
        fundId: zakatFundId, categoryId: zakatCategoryId, amountMinor: 5000,
        occurredOn: '2026-08-15', method: 'CASH',
      });

    expect(res.status).toBe(201);
  });

  it('does not restrict a non-Zakat fund against a non-eligible category', async () => {
    const tenant = await createTenant(server);
    const generalFundId = await fundByType(tenant, 'GENERAL');
    const generalCategoryId = await categoryByName(tenant, 'General Expenses');

    const res = await api().post(`/api/v1/mosques/${tenant.mosqueId}/expenses`)
      .set(auth(tenant)).set(idem())
      .send({
        fundId: generalFundId, categoryId: generalCategoryId, amountMinor: 5000,
        occurredOn: '2026-08-15', method: 'CASH',
      });

    expect(res.status).toBe(201);
  });

  it('applies the same restriction when posting a Payroll run\'s Salaries expenses from a Zakat-funded run', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/billing/mock-set-plan`)
      .set(auth(tenant)).set(idem()).send({ planCode: 'PRO' });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/staff`)
      .set(auth(tenant)).set(idem()).send({ name: 'Imam Karim', monthlySalaryMinor: 3000000 });
    const zakatFundId = await fundByType(tenant, 'ZAKAT');

    const run = await api().post(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs`)
      .set(auth(tenant)).set(idem()).send({ period: '2026-08', fundId: zakatFundId });
    const post = await api().post(`/api/v1/mosques/${tenant.mosqueId}/payroll/runs/${run.body.id}/post`)
      .set(auth(tenant)).set(idem());

    expect(post.status).toBe(409);
    expect(post.body.error.code).toBe('RULE_FUND_RESTRICTION_VIOLATED');
  });
});

describe('BR-10 — a mosque always has at least one active Admin', () => {
  async function addSecondAdmin(tenant: TenantFixture) {
    const invite = await api().post(`/api/v1/mosques/${tenant.mosqueId}/invitations`)
      .set(auth(tenant)).set(idem())
      .send({ emailOrPhone: `second-admin-${crypto.randomUUID()}@example.com`, role: 'ADMIN' });

    const second = await api().post('/api/v1/auth/register').send({
      email: `second-admin-${crypto.randomUUID()}@example.com`,
      password: 'correct-horse-battery', displayName: 'Second Admin', locale: 'en',
    });
    const secondToken = second.body.accessToken as string;

    const accept = await api().post(`/api/v1/invitations/${invite.body.token}/accept`)
      .set('Authorization', `Bearer ${secondToken}`).set(idem());

    return { membershipId: accept.body.id as string };
  }

  it('refuses to demote the sole Admin', async () => {
    const tenant = await createTenant(server);
    const members = await api().get(`/api/v1/mosques/${tenant.mosqueId}/members`).set(auth(tenant));
    const soleAdmin = (members.body as { id: string; role: string }[]).find((m) => m.role === 'ADMIN');

    const res = await api().patch(`/api/v1/mosques/${tenant.mosqueId}/members/${soleAdmin?.id}`)
      .set(auth(tenant)).set(idem())
      .send({ role: 'MEMBER' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RULE_LAST_ADMIN');
  });

  it('refuses to suspend the sole Admin', async () => {
    const tenant = await createTenant(server);
    const members = await api().get(`/api/v1/mosques/${tenant.mosqueId}/members`).set(auth(tenant));
    const soleAdmin = (members.body as { id: string; role: string }[]).find((m) => m.role === 'ADMIN');

    const res = await api().patch(`/api/v1/mosques/${tenant.mosqueId}/members/${soleAdmin?.id}`)
      .set(auth(tenant)).set(idem())
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RULE_LAST_ADMIN');
  });

  it('allows demoting one of two Admins, then refuses to demote the last one', async () => {
    const tenant = await createTenant(server);
    const { membershipId: secondAdminId } = await addSecondAdmin(tenant);

    const demoteSecond = await api().patch(`/api/v1/mosques/${tenant.mosqueId}/members/${secondAdminId}`)
      .set(auth(tenant)).set(idem())
      .send({ role: 'MEMBER' });
    expect(demoteSecond.status).toBe(200);

    const members = await api().get(`/api/v1/mosques/${tenant.mosqueId}/members`).set(auth(tenant));
    const remainingAdmin = (members.body as { id: string; role: string }[]).find((m) => m.role === 'ADMIN');

    const demoteLast = await api().patch(`/api/v1/mosques/${tenant.mosqueId}/members/${remainingAdmin?.id}`)
      .set(auth(tenant)).set(idem())
      .send({ role: 'TREASURER' });
    expect(demoteLast.status).toBe(409);
    expect(demoteLast.body.error.code).toBe('RULE_LAST_ADMIN');
  });

  it('never blocks changing a non-Admin\'s role or status, regardless of admin count', async () => {
    const tenant = await createTenant(server);
    const invite = await api().post(`/api/v1/mosques/${tenant.mosqueId}/invitations`)
      .set(auth(tenant)).set(idem())
      .send({ emailOrPhone: `member-${crypto.randomUUID()}@example.com`, role: 'MEMBER' });
    const memberUser = await api().post('/api/v1/auth/register').send({
      email: `member-${crypto.randomUUID()}@example.com`,
      password: 'correct-horse-battery', displayName: 'Regular Member', locale: 'en',
    });
    const accept = await api().post(`/api/v1/invitations/${invite.body.token}/accept`)
      .set('Authorization', `Bearer ${memberUser.body.accessToken}`).set(idem());

    const res = await api().patch(`/api/v1/mosques/${tenant.mosqueId}/members/${accept.body.id}`)
      .set(auth(tenant)).set(idem())
      .send({ status: 'SUSPENDED' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUSPENDED');
  });
});

describe('append-only ledgers reject direct UPDATE, even with tenant context set', () => {
  async function attemptDirectUpdate(tenantId: string, sql: string): Promise<Error | null> {
    try {
      await pool.executeAsTenant(tenantId, sql);
      return null;
    } catch (error) {
      return error as Error;
    }
  }

  it('DONATIONS: the immutability trigger blocks a direct UPDATE', async () => {
    const tenant = await createTenant(server);
    const donation = await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 10000, occurredOn: '2026-08-15', method: 'CASH' });

    const error = await attemptDirectUpdate(
      tenant.mosqueId, `UPDATE DONATIONS SET AMOUNT_MINOR = 1 WHERE ID = '${donation.body.id}'`,
    );
    expect(error?.message).toMatch(/append-only/i);
  });

  it('EXPENSES: the immutability trigger blocks a direct UPDATE', async () => {
    const tenant = await createTenant(server);
    const expense = await api().post(`/api/v1/mosques/${tenant.mosqueId}/expenses`)
      .set(auth(tenant)).set(idem())
      .send({
        fundId: tenant.fundId, categoryId: tenant.expenseCategoryId, amountMinor: 5000,
        occurredOn: '2026-08-15', method: 'CASH',
      });

    const error = await attemptDirectUpdate(
      tenant.mosqueId, `UPDATE EXPENSES SET AMOUNT_MINOR = 1 WHERE ID = '${expense.body.id}'`,
    );
    expect(error?.message).toMatch(/append-only/i);
  });

  it('DUES_PAYMENTS: the immutability trigger blocks a direct UPDATE', async () => {
    const tenant = await createTenant(server);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/households`)
      .set(auth(tenant)).set(idem())
      .send({ name: 'Rahman Household', monthlyDuesMinor: 50000 });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/generate`)
      .set(auth(tenant)).set(idem()).send({ period: '2026-08' });
    const charges = await api().get(`/api/v1/mosques/${tenant.mosqueId}/dues/charges?period=2026-08`).set(auth(tenant));
    const chargeId = charges.body[0].id as string;

    const payment = await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/charges/${chargeId}/payments`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 20000, paidOn: '2026-08-15', method: 'CASH' });

    const error = await attemptDirectUpdate(
      tenant.mosqueId, `UPDATE DUES_PAYMENTS SET AMOUNT_MINOR = 1 WHERE ID = '${payment.body.id}'`,
    );
    expect(error?.message).toMatch(/append-only/i);
  });
});

describe('FR-DON-4 — donation corrections are adjustment entries, not edits', () => {
  it('nets the fund balance to the correct amount while preserving both the original and the adjustment', async () => {
    const tenant = await createTenant(server);
    const donation = await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 10000, occurredOn: '2026-08-15', method: 'CASH' });

    await api().post(`/api/v1/mosques/${tenant.mosqueId}/donations/${donation.body.id}/adjust`)
      .set(auth(tenant)).set(idem())
      .send({ reason: 'Recorded in error' });

    const list = await api().get(`/api/v1/mosques/${tenant.mosqueId}/donations`).set(auth(tenant));
    expect(list.body).toHaveLength(2);

    const balance = await api().get(`/api/v1/mosques/${tenant.mosqueId}/donations/balance`).set(auth(tenant));
    const fundBalance = (balance.body as { fundId: string; totalMinor: number }[])
      .find((b) => b.fundId === tenant.fundId);
    expect(fundBalance?.totalMinor).toBe(0);
  });
});

describe('Dues charge payment rules', () => {
  async function createCharge(tenant: TenantFixture): Promise<string> {
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/households`)
      .set(auth(tenant)).set(idem())
      .send({ name: 'Rahman Household', monthlyDuesMinor: 50000 });
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/generate`)
      .set(auth(tenant)).set(idem()).send({ period: '2026-08' });
    const charges = await api().get(`/api/v1/mosques/${tenant.mosqueId}/dues/charges?period=2026-08`).set(auth(tenant));
    return charges.body[0].id as string;
  }

  it('rejects a payment larger than the remaining balance', async () => {
    const tenant = await createTenant(server);
    const chargeId = await createCharge(tenant);

    const res = await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/charges/${chargeId}/payments`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 100000, paidOn: '2026-08-15', method: 'CASH' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RULE_DUES_OVERPAYMENT');
  });

  it('rejects any further payment once a charge is fully paid', async () => {
    const tenant = await createTenant(server);
    const chargeId = await createCharge(tenant);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/charges/${chargeId}/payments`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 50000, paidOn: '2026-08-15', method: 'CASH' });

    const res = await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/charges/${chargeId}/payments`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 1, paidOn: '2026-08-16', method: 'CASH' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RULE_DUES_ALREADY_SETTLED');
  });

  it('rejects waiving a charge that is already paid', async () => {
    const tenant = await createTenant(server);
    const chargeId = await createCharge(tenant);
    await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/charges/${chargeId}/payments`)
      .set(auth(tenant)).set(idem())
      .send({ fundId: tenant.fundId, amountMinor: 50000, paidOn: '2026-08-15', method: 'CASH' });

    const res = await api().post(`/api/v1/mosques/${tenant.mosqueId}/dues/charges/${chargeId}/waive`)
      .set(auth(tenant)).set(idem())
      .send({ reason: 'Too late, already paid' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RULE_DUES_ALREADY_SETTLED');
  });
});
