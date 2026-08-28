import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleFundRepository } from '../../infrastructure/repositories/oracle/oracle-fund.repository.js';
import type { FundRecord } from './ports/fund.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';

export class FundsService {
  constructor(private readonly pool: OraclePool) {}

  async listMine(ctx: TenantContext): Promise<FundRecord[]> {
    return new OracleFundRepository(this.pool, ctx).listMine();
  }
}
