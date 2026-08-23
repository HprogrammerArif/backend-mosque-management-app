import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { loadEnv } from '../src/config/env.js';

let pool: OraclePool;

beforeAll(async () => {
  pool = new OraclePool(loadEnv());
  await pool.init();
});
afterAll(async () => { await pool.close(); });

describe('OraclePool', () => {
  it('executes a query with named binds', async () => {
    const rows = await pool.execute<{ answer: number }>(
      'SELECT :n AS answer FROM DUAL', { n: 42 },
    );
    expect(rows[0]?.answer).toBe(42);
  });

  it('lowercases column names for the domain layer', async () => {
    const rows = await pool.execute<{ some_value: number }>(
      'SELECT 1 AS SOME_VALUE FROM DUAL',
    );
    expect(rows[0]).toHaveProperty('some_value');
  });

  it('commits a successful transaction', async () => {
    await pool.execute('CREATE TABLE TX_PROBE (ID NUMBER)').catch(() => {});
    await pool.withTransaction(async (tx) => {
      await tx.execute('INSERT INTO TX_PROBE (ID) VALUES (:id)', { id: 1 });
    });
    const rows = await pool.execute<{ c: number }>('SELECT COUNT(*) AS C FROM TX_PROBE');
    expect(rows[0]?.c).toBe(1);
    await pool.execute('DROP TABLE TX_PROBE');
  });

  it('rolls back a failed transaction', async () => {
    await pool.execute('CREATE TABLE TX_PROBE2 (ID NUMBER)').catch(() => {});
    await expect(pool.withTransaction(async (tx) => {
      await tx.execute('INSERT INTO TX_PROBE2 (ID) VALUES (:id)', { id: 1 });
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const rows = await pool.execute<{ c: number }>('SELECT COUNT(*) AS C FROM TX_PROBE2');
    expect(rows[0]?.c).toBe(0);
    await pool.execute('DROP TABLE TX_PROBE2');
  });
});
