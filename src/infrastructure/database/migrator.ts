import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { OraclePool } from './oracle.pool.js';

export type AppliedMigration = { version: string; name: string; durationMs: number };

type MigrationFile = { version: string; name: string; sql: string; checksum: string };

const BOOTSTRAP = `
CREATE TABLE SCHEMA_MIGRATIONS (
  VERSION     VARCHAR2(20)  NOT NULL,
  NAME        VARCHAR2(200) NOT NULL,
  CHECKSUM    VARCHAR2(64)  NOT NULL,
  APPLIED_AT  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  DURATION_MS NUMBER(10),
  CONSTRAINT PK_SCHEMA_MIGRATIONS PRIMARY KEY (VERSION)
)`;

/**
 * Forward-only, checksummed. Migrations are append-only, exactly like the ledger:
 * a changed applied migration fails the build rather than silently re-applying.
 * Rollback is a new migration, never a reversal — down-migrations are routinely
 * wrong and dangerously reassuring.
 */
export class Migrator {
  constructor(private readonly pool: OraclePool, private readonly dir: string) {}

  #read(): MigrationFile[] {
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((file) => {
        const sql = readFileSync(join(this.dir, file), 'utf8');
        const version = file.slice(0, file.indexOf('_'));
        return {
          version,
          name: file,
          sql,
          checksum: createHash('sha256').update(sql).digest('hex'),
        };
      });
  }

  async #ensureTable(): Promise<void> {
    try {
      await this.pool.execute('SELECT 1 FROM SCHEMA_MIGRATIONS WHERE 1=0');
    } catch {
      await this.pool.execute(BOOTSTRAP);
    }
  }

  async #applied(): Promise<Map<string, string>> {
    await this.#ensureTable();
    const rows = await this.pool.execute<{ version: string; checksum: string }>(
      'SELECT VERSION, CHECKSUM FROM SCHEMA_MIGRATIONS',
    );
    return new Map(rows.map((r) => [r.version, r.checksum]));
  }

  async #pending(): Promise<MigrationFile[]> {
    const applied = await this.#applied();
    const pending: MigrationFile[] = [];
    for (const file of this.#read()) {
      const seen = applied.get(file.version);
      if (seen === undefined) { pending.push(file); continue; }
      if (seen !== file.checksum) {
        throw new Error(
          `Migration ${file.name} has changed after being applied (checksum mismatch). ` +
          `Migrations are append-only — add a new migration instead.`,
        );
      }
    }
    return pending;
  }

  async pendingCount(): Promise<number> {
    return (await this.#pending()).length;
  }

  async up(): Promise<AppliedMigration[]> {
    const pending = await this.#pending();
    const results: AppliedMigration[] = [];

    for (const file of pending) {
      const started = Date.now();
      // Statements are split on a lone ';' line — Oracle rejects a trailing ';'
      // inside a single execute(), so a file with several statements is split here.
      for (const statement of file.sql.split(/^\s*;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
        await this.pool.execute(statement);
      }
      const durationMs = Date.now() - started;
      await this.pool.execute(
        `INSERT INTO SCHEMA_MIGRATIONS (VERSION, NAME, CHECKSUM, DURATION_MS)
         VALUES (:version, :name, :checksum, :durationMs)`,
        { version: file.version, name: file.name, checksum: file.checksum, durationMs },
      );
      results.push({ version: file.version, name: file.name, durationMs });
    }
    return results;
  }
}
