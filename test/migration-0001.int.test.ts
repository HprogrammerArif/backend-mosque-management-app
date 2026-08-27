import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { Migrator } from '../src/infrastructure/database/migrator.js';
import { loadEnv } from '../src/config/env.js';

const migrations = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/infrastructure/database/migrations/oracle',
);
let pool: OraclePool;

beforeAll(async () => {
  pool = new OraclePool(loadEnv());
  await pool.init();
  await new Migrator(pool, migrations).up();
});
afterAll(async () => { await pool.close(); });

describe('migration 0001', () => {
  it('creates USERS with a contact constraint', async () => {
    await expect(pool.execute(
      `INSERT INTO USERS (ID, PASSWORD_HASH, DISPLAY_NAME)
       VALUES (:id, :h, :n)`,
      { id: 'u-no-contact', h: 'x', n: 'No Contact' },
    )).rejects.toThrow();
  });

  it('accepts a user with a phone only', async () => {
    await pool.execute(
      `INSERT INTO USERS (ID, PHONE, PASSWORD_HASH, DISPLAY_NAME)
       VALUES (:id, :p, :h, :n)`,
      { id: 'u-phone', p: '+8801700000001', h: 'x', n: 'Phone Only' },
    );
    const rows = await pool.execute<{ id: string }>(
      'SELECT ID FROM USERS WHERE ID = :id', { id: 'u-phone' },
    );
    expect(rows[0]?.id).toBe('u-phone');
    await pool.execute('DELETE FROM USERS WHERE ID = :id', { id: 'u-phone' });
  });

  it('enforces a unique phone number', async () => {
    await pool.execute(
      'INSERT INTO USERS (ID, PHONE, PASSWORD_HASH, DISPLAY_NAME) VALUES (:i,:p,:h,:n)',
      { i: 'u-a', p: '+8801700000002', h: 'x', n: 'A' },
    );
    await expect(pool.execute(
      'INSERT INTO USERS (ID, PHONE, PASSWORD_HASH, DISPLAY_NAME) VALUES (:i,:p,:h,:n)',
      { i: 'u-b', p: '+8801700000002', h: 'x', n: 'B' },
    )).rejects.toThrow();
    await pool.execute('DELETE FROM USERS WHERE ID = :id', { id: 'u-a' });
  });

  it('rejects an invalid device platform', async () => {
    await pool.execute(
      'INSERT INTO USERS (ID, PHONE, PASSWORD_HASH, DISPLAY_NAME) VALUES (:i,:p,:h,:n)',
      { i: 'u-d', p: '+8801700000003', h: 'x', n: 'D' },
    );
    await expect(pool.execute(
      'INSERT INTO DEVICES (ID, USER_ID, PLATFORM) VALUES (:i,:u,:p)',
      { i: 'd-1', u: 'u-d', p: 'BLACKBERRY' },
    )).rejects.toThrow();
    await pool.execute('DELETE FROM USERS WHERE ID = :id', { id: 'u-d' });
  });
});
