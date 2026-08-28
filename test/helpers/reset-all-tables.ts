import type { OraclePool } from '../../src/infrastructure/database/oracle.pool.js';

/** object_name/policy_name pairs for every VPD policy currently defined (grep the migrations for ADD_POLICY to keep this in sync). */
const VPD_POLICIES: ReadonlyArray<{ table: string; policy: string }> = [
  { table: 'FUNDS', policy: 'FUNDS_TENANT_POLICY' },
  { table: 'PRAYER_CONFIG', policy: 'PRAYER_CONFIG_TENANT_POLICY' },
  { table: 'HOUSEHOLDS', policy: 'HOUSEHOLDS_TENANT_POLICY' },
  { table: 'INDIVIDUALS', policy: 'INDIVIDUALS_TENANT_POLICY' },
  { table: 'DONATIONS', policy: 'DONATIONS_TENANT_POLICY' },
  { table: 'EXPENSE_CATEGORIES', policy: 'EXPCAT_TENANT_POLICY' },
  { table: 'EXPENSES', policy: 'EXPENSES_TENANT_POLICY' },
  { table: 'CHANGE_LOG', policy: 'CHANGE_LOG_TENANT_POLICY' },
  { table: 'DUES_CHARGES', policy: 'DUES_CHARGES_TENANT_POLICY' },
  { table: 'DUES_PAYMENTS', policy: 'DUES_PAYMENTS_TENANT_POLICY' },
  { table: 'STAFF', policy: 'STAFF_TENANT_POLICY' },
  { table: 'PAYROLL_RUNS', policy: 'PAYROLL_RUNS_TENANT_POLICY' },
  { table: 'PAYROLL_LINES', policy: 'PAYROLL_LINES_TENANT_POLICY' },
  { table: 'COMMITTEE_MEMBERS', policy: 'COMMITTEE_MEMBERS_TENANT_POLICY' },
  { table: 'EVENTS', policy: 'EVENTS_TENANT_POLICY' },
  { table: 'ANNOUNCEMENTS', policy: 'ANNOUNCEMENTS_TENANT_POLICY' },
];

/**
 * Resets every tenant-owned and auth table, in FK-safe child-to-parent order, for e2e
 * tests spanning more than one module (sync, cross-tenant leakage, and anything that
 * needs a household/donation/etc. alongside a user).
 *
 * Every table above is VPD-protected and fails closed with no tenant context — an
 * unscoped `DELETE FROM DONATIONS` silently deletes 0 rows rather than erroring (same
 * behaviour that bit `maxSafeChangeSeq` during Phase 2B), which would leave FK-referenced
 * rows behind and break the *next* table's delete instead of this one's. Looping
 * `executeAsTenant` per mosque would work but costs a full connection + context round
 * trip per table per tenant; disabling each policy for the duration of the reset, wiping
 * every tenant's rows in one statement per table, then re-enabling is the same trick
 * `pnpm db:reset` uses at the volume level, scaled down to "reset the data, not the
 * schema." Tests run serially (`fileParallelism: false` in vitest.int.config.ts) so
 * there's no request racing through mid-reset while policies are down.
 *
 * PLANS and SCHEMA_MIGRATIONS are never touched: PLANS is seed/reference data (BASIC/PRO)
 * that other tests depend on existing, and SCHEMA_MIGRATIONS tracks applied migrations.
 *
 * HOUSEHOLDS and INDIVIDUALS have a circular FK (HOUSEHOLDS.HEAD_INDIVIDUAL_ID ->
 * INDIVIDUALS.ID) — nulling it out before deleting INDIVIDUALS breaks the cycle without
 * needing a deferred constraint.
 */
export async function resetAllTables(pool: OraclePool): Promise<void> {
  for (const { table, policy } of VPD_POLICIES) {
    await pool.execute(`BEGIN
      DBMS_RLS.ENABLE_POLICY(
        object_schema => 'MASJID', object_name => '${table}', policy_name => '${policy}', enable => FALSE
      );
    END;`);
  }

  try {
    await pool.execute('DELETE FROM PAYROLL_LINES');
    await pool.execute('DELETE FROM DUES_PAYMENTS');
    await pool.execute('DELETE FROM EXPENSES');
    await pool.execute('DELETE FROM DONATIONS');
    await pool.execute('DELETE FROM DUES_CHARGES');
    await pool.execute('DELETE FROM PAYROLL_RUNS');
    await pool.execute('DELETE FROM STAFF');
    await pool.execute('UPDATE HOUSEHOLDS SET HEAD_INDIVIDUAL_ID = NULL');
    await pool.execute('DELETE FROM INDIVIDUALS');
    await pool.execute('DELETE FROM HOUSEHOLDS');
    await pool.execute('DELETE FROM EXPENSE_CATEGORIES');
    await pool.execute('DELETE FROM FUNDS');
    await pool.execute('DELETE FROM COMMITTEE_MEMBERS');
    await pool.execute('DELETE FROM EVENTS');
    await pool.execute('DELETE FROM ANNOUNCEMENTS');
    await pool.execute('DELETE FROM CHANGE_LOG');
    await pool.execute('DELETE FROM PRAYER_CONFIG');
    await pool.execute('DELETE FROM INVITATIONS');
    await pool.execute('DELETE FROM SUBSCRIPTIONS');
    await pool.execute('DELETE FROM MEMBERSHIPS');
    await pool.execute('DELETE FROM MOSQUES');
    await pool.execute('DELETE FROM NOTIFICATION_PREFERENCES');
    await pool.execute('DELETE FROM REFRESH_TOKENS');
    await pool.execute('DELETE FROM DEVICES');
    await pool.execute('DELETE FROM USERS');
  } finally {
    for (const { table, policy } of VPD_POLICIES) {
      await pool.execute(`BEGIN
        DBMS_RLS.ENABLE_POLICY(
          object_schema => 'MASJID', object_name => '${table}', policy_name => '${policy}', enable => TRUE
        );
      END;`);
    }
  }
}
