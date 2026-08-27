import type { OraclePool } from '../../src/infrastructure/database/oracle.pool.js';

/**
 * Resets every table in the auth module's FK chain, in child-to-parent order.
 *
 * Integration tests share one persistent Oracle instance across the whole suite
 * (not a fresh database per file), so a test file that deletes only the table it
 * "owns" can be blocked by another suite's leftover child rows (ORA-02292) — or,
 * worse, silently succeed while leaving orphaned rows for a third suite to trip
 * over. Every integration test touching auth tables should reset through this
 * helper rather than its own ad-hoc DELETEs, so the FK order is correct in
 * exactly one place as more tables gain foreign keys to USERS.
 */
export async function resetAuthTables(pool: OraclePool): Promise<void> {
  await pool.execute('DELETE FROM REFRESH_TOKENS');
  await pool.execute('DELETE FROM DEVICES');
  await pool.execute('DELETE FROM USERS');
}
