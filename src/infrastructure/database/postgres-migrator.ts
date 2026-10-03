import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { PostgresPool } from './postgres.pool.js';
import type { AppliedMigration } from './migrator.js';

type MigrationFile = { version: string; name: string; sql: string; checksum: string };

const BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20)  PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  checksum    VARCHAR(64)  NOT NULL,
  applied_at  TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP NOT NULL,
  duration_ms INT
)`;

export class PostgresMigrator {
  constructor(private readonly pool: PostgresPool, private readonly dir: string) {}

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
      await this.pool.execute('SELECT 1 FROM schema_migrations WHERE 1=0');
    } catch {
      await this.pool.execute(BOOTSTRAP);
    }
  }

  async #applied(): Promise<Map<string, string>> {
    await this.#ensureTable();
    const rows = await this.pool.execute<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations',
    );
    return new Map(rows.map((r) => [r.version, r.checksum]));
  }

  async #pending(): Promise<MigrationFile[]> {
    const applied = await this.#applied();
    const pending: MigrationFile[] = [];
    for (const file of this.#read()) {
      const seen = applied.get(file.version);
      if (seen === undefined) {
        pending.push(file);
        continue;
      }
      if (seen !== file.checksum) {
        throw new Error(
          `Postgres Migration ${file.name} has changed after being applied (checksum mismatch). ` +
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
      // Apply the migration SQL
      await this.pool.executeScript(file.sql);
      const durationMs = Date.now() - started;
      await this.pool.execute(
        `INSERT INTO schema_migrations (version, name, checksum, duration_ms)
         VALUES (:version, :name, :checksum, :durationMs)
         ON CONFLICT (version) DO NOTHING`,
        { version: file.version, name: file.name, checksum: file.checksum, durationMs },
      );
      results.push({ version: file.version, name: file.name, durationMs });
    }
    return results;
  }
}
