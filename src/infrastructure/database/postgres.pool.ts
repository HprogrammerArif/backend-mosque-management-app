import pg from 'pg';
import type { Env } from '../../config/env.js';

export type Binds = Record<string, unknown>;

export type Tx = {
  execute<T>(sql: string, binds?: Binds): Promise<T[]>;
};

// Parse int8 (BIGINT) as number so money amounts and change sequences match Oracle driver behavior
pg.types.setTypeParser(20, (val: string) => (val === null ? null : parseInt(val, 10)));
// Parse numeric as float
pg.types.setTypeParser(1700, (val: string) => (val === null ? null : parseFloat(val)));

function normaliseRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // Treat empty string as null, lowercasing keys for domain layer
    out[key.toLowerCase()] = value === '' ? null : value;
  }
  return out as T;
}

export function prepareQuery(sql: string, binds: Binds = {}): { sql: string; values: unknown[] } {
  let transformedSql = sql
    .replace(/\bSEQ_CHANGE\.NEXTVAL\b/gi, "nextval('seq_change')")
    .replace(/\bSYSTIMESTAMP\b/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bSYSDATE\b/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bNVL\(/gi, 'COALESCE(');

  const values: unknown[] = [];
  const nameToIndex = new Map<string, number>();

  // Transform :bindName to $1, $2, ... avoiding PostgreSQL type casts (::text, ::int)
  transformedSql = transformedSql.replace(/(?<!:):([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
    if (!(name in binds)) {
      return match;
    }
    if (nameToIndex.has(name)) {
      return '$' + nameToIndex.get(name);
    }
    values.push(binds[name]);
    const idx = values.length;
    nameToIndex.set(name, idx);
    return '$' + idx;
  });

  return { sql: transformedSql, values };
}

export class PostgresPool {
  #pool: pg.Pool | undefined;

  constructor(private readonly env: Env) {}

  async init(): Promise<void> {
    const connectionString = this.env.DATABASE_URL || this.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL or POSTGRES_URL must be defined for PostgreSQL dialect');
    }

    this.#pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      min: 2,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    // Verify connectivity on init
    const client = await this.#pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  #require(): pg.Pool {
    if (!this.#pool) throw new Error('PostgresPool.init() has not been called');
    return this.#pool;
  }

  async executeScript(sql: string): Promise<void> {
    const client = await this.#require().connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  }

  async execute<T>(sql: string, binds: Binds = {}): Promise<T[]> {
    const client = await this.#require().connect();
    try {
      const { sql: preparedSql, values } = prepareQuery(sql, binds);
      const result = values.length === 0
        ? await client.query<Record<string, unknown>>(preparedSql)
        : await client.query<Record<string, unknown>>(preparedSql, values);
      return (result.rows ?? []).map((r) => normaliseRow<T>(r));
    } finally {
      client.release();
    }
  }

  async executeAsTenant<T>(tenantId: string, sql: string, binds: Binds = {}): Promise<T[]> {
    const client = await this.#require().connect();
    try {
      const { sql: preparedSql, values } = prepareQuery(sql, { ...binds, tenantId });
      const result = await client.query<Record<string, unknown>>(preparedSql, values);
      return (result.rows ?? []).map((r) => normaliseRow<T>(r));
    } finally {
      client.release();
    }
  }

  async withTenantTransaction<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.#require().connect();

    const tx: Tx = {
      execute: async <R>(sql: string, binds: Binds = {}) => {
        const { sql: preparedSql, values } = prepareQuery(sql, { ...binds, tenantId });
        const result = await client.query<Record<string, unknown>>(preparedSql, values);
        return (result.rows ?? []).map((r) => normaliseRow<R>(r));
      },
    };

    try {
      await client.query('BEGIN');
      const value = await fn(tx);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.#require().connect();

    const tx: Tx = {
      execute: async <R>(sql: string, binds: Binds = {}) => {
        const { sql: preparedSql, values } = prepareQuery(sql, binds);
        const result = await client.query<Record<string, unknown>>(preparedSql, values);
        return (result.rows ?? []).map((r) => normaliseRow<R>(r));
      },
    };

    try {
      await client.query('BEGIN');
      const value = await fn(tx);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool?.end();
    this.#pool = undefined;
  }
}
