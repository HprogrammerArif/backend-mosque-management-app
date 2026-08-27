import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { uuidv7 } from 'uuidv7';
import { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { OracleUserRepository } from '../src/infrastructure/repositories/oracle/oracle-user.repository.js';
import { loadEnv } from '../src/config/env.js';

let pool: OraclePool;
let repo: OracleUserRepository;

beforeAll(async () => {
  pool = new OraclePool(loadEnv());
  await pool.init();
  repo = new OracleUserRepository(pool);
});
afterAll(async () => { await pool.close(); });
beforeEach(async () => { await pool.execute('DELETE FROM USERS'); });

const base = () => ({
  id: uuidv7(), phone: '+8801712345678', email: null,
  passwordHash: 'hash', displayName: 'Kamal Hossain', locale: 'bn',
});

describe('OracleUserRepository', () => {
  it('creates and reads back a user', async () => {
    const input = base();
    const created = await repo.create(input);
    expect(created.id).toBe(input.id);
    expect(created.status).toBe('ACTIVE');
    expect(created.failedAttempts).toBe(0);

    const found = await repo.findById(input.id);
    expect(found?.displayName).toBe('Kamal Hossain');
  });

  it('finds by phone number', async () => {
    const input = base();
    await repo.create(input);
    expect((await repo.findByIdentifier('+8801712345678'))?.id).toBe(input.id);
  });

  it('finds by email case-insensitively', async () => {
    const input = { ...base(), phone: null, email: 'Kamal@Example.com' };
    await repo.create(input);
    expect((await repo.findByIdentifier('kamal@example.com'))?.id).toBe(input.id);
  });

  it('returns null for an unknown identifier', async () => {
    expect(await repo.findByIdentifier('+8809999999999')).toBeNull();
  });

  it('increments and clears failed attempts', async () => {
    const input = base();
    await repo.create(input);
    await repo.recordFailedAttempt(input.id);
    await repo.recordFailedAttempt(input.id);
    expect((await repo.findById(input.id))?.failedAttempts).toBe(2);

    await repo.clearFailedAttempts(input.id);
    expect((await repo.findById(input.id))?.failedAttempts).toBe(0);
  });

  it('locks the account at five failed attempts', async () => {
    const input = base();
    await repo.create(input);
    for (let i = 0; i < 5; i++) await repo.recordFailedAttempt(input.id);
    const user = await repo.findById(input.id);
    expect(user?.lockedUntil).toBeInstanceOf(Date);
    expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});
