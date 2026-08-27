import oracledb from 'oracledb';
import type { Env } from '../../config/env.js';

/**
 * Domain-facing bind shape. Converted to the driver's `BindParameters` at the two call
 * sites below, so `oracledb` types never leak above this file (ADR-0002).
 */
export type Binds = Record<string, unknown>;

export type Tx = {
  execute<T>(sql: string, binds?: Binds): Promise<T[]>;
};

/** Oracle returns UPPERCASE column names; the domain layer speaks lower_snake. */
function normaliseRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // Oracle treats '' as NULL. Normalise so the domain never has to know.
    out[key.toLowerCase()] = value === '' ? null : value;
  }
  return out as T;
}

export class OraclePool {
  #pool: oracledb.Pool | undefined;

  constructor(private readonly env: Env) {}

  async init(): Promise<void> {
    // Fetch CLOBs as strings so no repository has to handle streams.
    oracledb.fetchAsString = [oracledb.CLOB];

    this.#pool = await oracledb.createPool({
      user: this.env.ORACLE_USER,
      password: this.env.ORACLE_PASSWORD,
      connectString: this.env.ORACLE_CONNECT_STRING,
      poolMin: this.env.ORACLE_POOL_MIN,
      poolMax: this.env.ORACLE_POOL_MAX,
      poolIncrement: 1,
      poolTimeout: 60,
      queueTimeout: 5_000,     // fail fast rather than accumulate a thundering queue
      stmtCacheSize: 60,
      enableStatistics: true,
    });
  }

  #require(): oracledb.Pool {
    if (!this.#pool) throw new Error('OraclePool.init() has not been called');
    return this.#pool;
  }

  async execute<T>(sql: string, binds: Binds = {}): Promise<T[]> {
    const conn = await this.#require().getConnection();
    try {
      const result = await conn.execute<Record<string, unknown>>(sql, binds as oracledb.BindParameters, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      });
      return (result.rows ?? []).map((r) => normaliseRow<T>(r));
    } finally {
      await conn.close();
    }
  }

  /**
   * Tenant-scoped read/write. Every `execute()` call already acquires and releases its
   * own connection (no persistent per-request connection exists here), so "set the VPD
   * context on acquire, clear it on release" (multi-tenancy doc, Layer 2) maps onto
   * "set immediately before the query, clear immediately after, on the same connection,
   * every call." A stale context on a released connection is worse than none, hence the
   * best-effort clear in `finally` even though the connection is about to close anyway.
   */
  async executeAsTenant<T>(tenantId: string, sql: string, binds: Binds = {}): Promise<T[]> {
    const conn = await this.#require().getConnection();
    try {
      await conn.execute('BEGIN masjid_ctx_pkg.set_tenant(:tenantId); END;', { tenantId });
      const result = await conn.execute<Record<string, unknown>>(sql, binds as oracledb.BindParameters, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      });
      return (result.rows ?? []).map((r) => normaliseRow<T>(r));
    } finally {
      await conn.execute('BEGIN masjid_ctx_pkg.set_tenant(NULL); END;').catch(() => {});
      await conn.close();
    }
  }

  async withTenantTransaction<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const conn = await this.#require().getConnection();

    const tx: Tx = {
      execute: async <R>(sql: string, binds: Binds = {}) => {
        const result = await conn.execute<Record<string, unknown>>(sql, binds as oracledb.BindParameters, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: false,
        });
        return (result.rows ?? []).map((r) => normaliseRow<R>(r));
      },
    };

    try {
      await conn.execute('BEGIN masjid_ctx_pkg.set_tenant(:tenantId); END;', { tenantId });
      const value = await fn(tx);
      await conn.commit();
      return value;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await conn.execute('BEGIN masjid_ctx_pkg.set_tenant(NULL); END;').catch(() => {});
      await conn.close();
    }
  }

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const conn = await this.#require().getConnection();

    const tx: Tx = {
      execute: async <R>(sql: string, binds: Binds = {}) => {
        const result = await conn.execute<Record<string, unknown>>(sql, binds as oracledb.BindParameters, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: false,
        });
        return (result.rows ?? []).map((r) => normaliseRow<R>(r));
      },
    };

    try {
      const value = await fn(tx);
      await conn.commit();
      return value;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await conn.close();
    }
  }

  async close(): Promise<void> {
    await this.#pool?.close(10);
    this.#pool = undefined;
  }
}
