import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import { BaseRepository } from '../base.repository.js';
import type {
  StatisticsRepository, IncomeExpenditure, FundBalance, DonationTrendPoint,
} from '../../../modules/statistics/ports/statistics.repository.js';

const SQL_INCOME = `
  SELECT NVL(SUM(AMOUNT_MINOR), 0) AS TOTAL_MINOR FROM DONATIONS
   WHERE TENANT_ID = :tenantId AND OCCURRED_ON BETWEEN :fromDate AND :toDate`;

const SQL_EXPENDITURE = `
  SELECT NVL(SUM(AMOUNT_MINOR), 0) AS TOTAL_MINOR FROM EXPENSES
   WHERE TENANT_ID = :tenantId AND OCCURRED_ON BETWEEN :fromDate AND :toDate`;

/**
 * Fund balance = lifetime donations into the fund minus lifetime expenses from it — both
 * sides already net out corrections/adjustments (FR-DON-4, ExpensesService.adjust), since
 * SUM(AMOUNT_MINOR) includes the negated adjustment rows alongside the originals.
 */
const SQL_FUND_BALANCES = `
  SELECT f.ID AS FUND_ID, f.NAME AS FUND_NAME,
         NVL(d.TOTAL_MINOR, 0) - NVL(e.TOTAL_MINOR, 0) AS BALANCE_MINOR
    FROM FUNDS f
    LEFT JOIN (
      SELECT FUND_ID, SUM(AMOUNT_MINOR) AS TOTAL_MINOR FROM DONATIONS
       WHERE TENANT_ID = :tenantId GROUP BY FUND_ID
    ) d ON d.FUND_ID = f.ID
    LEFT JOIN (
      SELECT FUND_ID, SUM(AMOUNT_MINOR) AS TOTAL_MINOR FROM EXPENSES
       WHERE TENANT_ID = :tenantId GROUP BY FUND_ID
    ) e ON e.FUND_ID = f.ID
   WHERE f.TENANT_ID = :tenantId
   ORDER BY f.NAME`;

const SQL_DONATION_TRENDS = `
  SELECT TO_CHAR(OCCURRED_ON, 'YYYY-MM') AS PERIOD, SUM(AMOUNT_MINOR) AS TOTAL_MINOR
    FROM DONATIONS
   WHERE TENANT_ID = :tenantId AND OCCURRED_ON >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -:months)
   GROUP BY TO_CHAR(OCCURRED_ON, 'YYYY-MM')
   ORDER BY PERIOD`;

export class OracleStatisticsRepository extends BaseRepository implements StatisticsRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async incomeExpenditure(fromDate: string, toDate: string): Promise<IncomeExpenditure> {
    const binds = { fromDate: new Date(fromDate), toDate: new Date(toDate) };
    const [incomeRows, expenditureRows] = await Promise.all([
      this.scoped<{ total_minor: number }>(SQL_INCOME, binds),
      this.scoped<{ total_minor: number }>(SQL_EXPENDITURE, binds),
    ]);
    const incomeMinor = Number(incomeRows[0]?.total_minor ?? 0);
    const expenditureMinor = Number(expenditureRows[0]?.total_minor ?? 0);
    return { incomeMinor, expenditureMinor, netMinor: incomeMinor - expenditureMinor };
  }

  async fundBalances(): Promise<FundBalance[]> {
    const rows = await this.scoped<{ fund_id: string; fund_name: string; balance_minor: number }>(SQL_FUND_BALANCES);
    return rows.map((r) => ({ fundId: r.fund_id, fundName: r.fund_name, balanceMinor: Number(r.balance_minor) }));
  }

  /**
   * `months=1` means "this month only" — the cutoff has to be `months - 1` back from the
   * start of the current month (0 back = this month's start), not `months` back, or every
   * call would include one extra trailing month (verified live: months=1 was returning
   * both July and August).
   */
  async donationTrends(months: number): Promise<DonationTrendPoint[]> {
    const rows = await this.scoped<{ period: string; total_minor: number }>(
      SQL_DONATION_TRENDS, { months: months - 1 },
    );
    return rows.map((r) => ({ period: r.period, totalMinor: Number(r.total_minor) }));
  }
}
