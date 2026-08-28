import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleStatisticsRepository } from '../../infrastructure/repositories/oracle/oracle-statistics.repository.js';
import type { IncomeExpenditure, FundBalance, DonationTrendPoint } from './ports/statistics.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';

const DEFAULT_TREND_MONTHS = 6;

export class StatisticsService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleStatisticsRepository {
    return new OracleStatisticsRepository(this.pool, ctx);
  }

  async incomeExpenditure(
    ctx: TenantContext, fromDate: string, toDate: string,
  ): Promise<IncomeExpenditure & { fromDate: string; toDate: string }> {
    const result = await this.#repo(ctx).incomeExpenditure(fromDate, toDate);
    return { ...result, fromDate, toDate };
  }

  async fundBalances(ctx: TenantContext): Promise<FundBalance[]> {
    return this.#repo(ctx).fundBalances();
  }

  async donationTrends(ctx: TenantContext, months = DEFAULT_TREND_MONTHS): Promise<DonationTrendPoint[]> {
    return this.#repo(ctx).donationTrends(months);
  }
}
