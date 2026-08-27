import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { OraclePool } from './oracle.pool.js';
import { Migrator } from './migrator.js';
import { loadEnv } from '../../config/env.js';

const here = dirname(fileURLToPath(import.meta.url));
const pool = new OraclePool(loadEnv());

await pool.init();
try {
  const applied = await new Migrator(pool, join(here, 'migrations/oracle')).up();
  if (applied.length === 0) console.log('No pending migrations.');
  for (const m of applied) console.log(`Applied ${m.name} in ${m.durationMs}ms`);
} finally {
  await pool.close();
}
