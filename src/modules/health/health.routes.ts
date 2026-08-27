import type { RouteDefinition } from '../../http/types.js';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import type { Migrator } from '../../infrastructure/database/migrator.js';

export function healthRoutes(deps: { pool: OraclePool; migrator: Migrator }): RouteDefinition[] {
  return [
    { method: 'GET', path: '/health', permission: 'PUBLIC', middleware: [],
      handler: () => ({ status: 'ok' }) },

    { method: 'GET', path: '/ready', permission: 'PUBLIC', middleware: [],
      handler: async () => {
        await deps.pool.execute('SELECT 1 FROM DUAL');
        return { database: 'ok', pendingMigrations: await deps.migrator.pendingCount() };
      } },
  ];
}
