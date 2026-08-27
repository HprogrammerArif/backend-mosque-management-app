import type { OraclePool, Binds } from '../database/oracle.pool.js';
import type { TenantContext } from '../../modules/tenancy/tenant-context.js';

/**
 * No tenant-owned repository method accepts a `tenantId` parameter — it comes from
 * `ctx` or nowhere. Taking it as an argument is how the wrong one gets passed
 * (multi-tenancy doc, Layer 1). Every query funnels through `scoped()`.
 */
export abstract class BaseRepository {
  protected constructor(
    protected readonly pool: OraclePool,
    protected readonly ctx: TenantContext,
  ) {}

  protected scoped<T>(sql: string, binds: Binds = {}): Promise<T[]> {
    return this.pool.executeAsTenant<T>(this.ctx.tenantId, sql, { ...binds, tenantId: this.ctx.tenantId });
  }
}
