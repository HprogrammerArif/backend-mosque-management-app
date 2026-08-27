import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { Migrator } from '../src/infrastructure/database/migrator.js';
import { loadEnv } from '../src/config/env.js';

let pool: OraclePool;
let dir: string;

beforeAll(async () => { pool = new OraclePool(loadEnv()); await pool.init(); });
afterAll(async () => { await pool.close(); rmSync(dir, { recursive: true, force: true }); });

beforeEach(async () => {
  await pool.execute('DROP TABLE MIG_PROBE').catch(() => {});
  await pool.execute('DELETE FROM SCHEMA_MIGRATIONS').catch(() => {});
  dir = mkdtempSync(join(tmpdir(), 'mig-'));
});

describe('Migrator', () => {
  it('applies a pending migration and records it', async () => {
    writeFileSync(join(dir, '0001_probe.sql'), 'CREATE TABLE MIG_PROBE (ID NUMBER)');
    const applied = await new Migrator(pool, dir).up();

    expect(applied).toHaveLength(1);
    expect(applied[0]?.version).toBe('0001');
    const rows = await pool.execute('SELECT * FROM MIG_PROBE');
    expect(rows).toEqual([]);
  });

  it('is idempotent — a second run applies nothing', async () => {
    writeFileSync(join(dir, '0001_probe.sql'), 'CREATE TABLE MIG_PROBE (ID NUMBER)');
    await new Migrator(pool, dir).up();
    const second = await new Migrator(pool, dir).up();
    expect(second).toHaveLength(0);
  });

  it('refuses to run when an applied migration has changed', async () => {
    const file = join(dir, '0001_probe.sql');
    writeFileSync(file, 'CREATE TABLE MIG_PROBE (ID NUMBER)');
    await new Migrator(pool, dir).up();

    writeFileSync(file, 'CREATE TABLE MIG_PROBE (ID NUMBER, EXTRA NUMBER)');
    await expect(new Migrator(pool, dir).up()).rejects.toThrow(/checksum/i);
  });

  it('reports the pending count without applying', async () => {
    writeFileSync(join(dir, '0001_probe.sql'), 'CREATE TABLE MIG_PROBE (ID NUMBER)');
    expect(await new Migrator(pool, dir).pendingCount()).toBe(1);
  });
});
