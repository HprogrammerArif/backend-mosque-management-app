import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OraclePool } from './oracle.pool.js';
import { Migrator } from './migrator.js';
import { PostgresPool } from './postgres.pool.js';
import { PostgresMigrator } from './postgres-migrator.js';
import { loadEnv } from '../../config/env.js';

const here = dirname(fileURLToPath(import.meta.url));
const env = loadEnv();
const isPostgres = env.DB_DIALECT === 'postgres' || Boolean(env.DATABASE_URL || env.POSTGRES_URL);

const pool = isPostgres ? new PostgresPool(env) : new OraclePool(env);

await pool.init();
try {
  const migrator = isPostgres
    ? new PostgresMigrator(pool as PostgresPool, join(here, 'migrations/postgres'))
    : new Migrator(pool as OraclePool, join(here, 'migrations/oracle'));
  const applied = await migrator.up();
  if (applied.length === 0) console.log(`[${isPostgres ? 'PostgreSQL' : 'Oracle'}] No pending migrations.`);
  for (const m of applied) console.log(`[${isPostgres ? 'PostgreSQL' : 'Oracle'}] Applied ${m.name} in ${m.durationMs}ms`);
} finally {
  await pool.close();
}
