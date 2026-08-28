import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OraclePayrollRunRepository } from '../../infrastructure/repositories/oracle/oracle-payroll-run.repository.js';
import { OracleStaffRepository } from '../../infrastructure/repositories/oracle/oracle-staff.repository.js';
import { OracleFundRepository } from '../../infrastructure/repositories/oracle/oracle-fund.repository.js';
import { OracleExpenseCategoryRepository } from '../../infrastructure/repositories/oracle/oracle-expense-category.repository.js';
import { OracleExpenseRepository } from '../../infrastructure/repositories/oracle/oracle-expense.repository.js';
import type { PayrollRunRecord, PayrollLineRecord } from './ports/payroll-run.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreatePayrollRunRequest } from './payroll.schemas.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Currency } from '../../domain/money.js';

/** Last calendar day of a "YYYY-MM" period — same convention as dues.service.ts. */
function periodEndDate(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(lastDay).padStart(2, '0')}`;
}

export class PayrollService {
  constructor(private readonly pool: OraclePool) {}

  #runs(ctx: TenantContext): OraclePayrollRunRepository {
    return new OraclePayrollRunRepository(this.pool, ctx);
  }

  #staff(ctx: TenantContext): OracleStaffRepository {
    return new OracleStaffRepository(this.pool, ctx);
  }

  #expenses(ctx: TenantContext): OracleExpenseRepository {
    return new OracleExpenseRepository(this.pool, ctx);
  }

  /**
   * One PAYROLL_RUN per period, one PAYROLL_LINE per active staff member snapshotting
   * their current monthlySalaryMinor — same "snapshot at generation time" shape as
   * DuesService.generateForPeriod, so a later salary change never retroactively edits an
   * already-generated run.
   */
  async createRun(ctx: TenantContext, input: CreatePayrollRunRequest): Promise<PayrollRunRecord> {
    const runs = this.#runs(ctx);
    const existing = await runs.findByPeriod(input.period);
    if (existing) return existing;

    const run = await runs.create({ id: uuidv7(), ...input, createdBy: ctx.userId });
    const staff = await this.#staff(ctx).listActive();
    for (const member of staff) {
      if (member.monthlySalaryMinor <= 0) continue;
      await runs.createLine({
        id: uuidv7(), runId: run.id, staffId: member.id,
        amountMinor: member.monthlySalaryMinor, currency: member.currency,
      });
    }
    return run;
  }

  async getById(ctx: TenantContext, id: string): Promise<PayrollRunRecord> {
    const run = await this.#runs(ctx).findById(id);
    if (!run) throw new AppError('NOT_FOUND', `Payroll run ${id} not found`);
    return run;
  }

  async listLines(ctx: TenantContext, runId: string): Promise<PayrollLineRecord[]> {
    await this.getById(ctx, runId);
    return this.#runs(ctx).listLines(runId);
  }

  /**
   * "Post to ledger": one EXPENSE per line, written under the seeded Salaries category,
   * inside the same transaction that marks the run POSTED — a run that's POSTED with a
   * line missing its EXPENSE_ID (or vice versa) is exactly the split-write this exists to
   * prevent (same reasoning as DuesService.recordPayment).
   */
  async postRun(ctx: TenantContext, runId: string): Promise<PayrollRunRecord> {
    const runs = this.#runs(ctx);
    const run = await this.getById(ctx, runId);
    if (run.status === 'POSTED') {
      throw new AppError('RULE_PAYROLL_ALREADY_POSTED', `Payroll run ${runId} is already posted`);
    }

    const fund = await new OracleFundRepository(this.pool, ctx).findById(run.fundId);
    if (!fund) throw new AppError('NOT_FOUND', `Fund ${run.fundId} not found`);

    const categories = await new OracleExpenseCategoryRepository(this.pool, ctx).listAll();
    const salariesCategory = categories.find((c) => c.name === 'Salaries');
    if (!salariesCategory) throw new AppError('NOT_FOUND', 'Salaries expense category not found');

    if (fund.zakatEligible && !salariesCategory.zakatEligible) {
      throw new AppError(
        'RULE_FUND_RESTRICTION_VIOLATED',
        `Fund "${fund.name}" is Zakat-restricted (BR-1) — Salaries is not a zakat-eligible category`,
      );
    }

    const lines = await runs.listLines(runId);
    const occurredOn = periodEndDate(run.period);
    const staffById = new Map((await this.#staff(ctx).listActive()).map((s) => [s.id, s]));

    await this.pool.withTenantTransaction(ctx.tenantId, async (tx) => {
      const expensesRepo = this.#expenses(ctx);
      for (const line of lines) {
        const staffMember = staffById.get(line.staffId);
        const expense = await expensesRepo.create({
          id: uuidv7(),
          fundId: run.fundId,
          categoryId: salariesCategory.id,
          amountMinor: line.amountMinor,
          currency: line.currency as Currency,
          occurredOn,
          payee: staffMember?.name ?? null,
          description: `Payroll ${run.period}`,
          method: 'BANK',
          adjustsId: null,
          adjustmentReason: null,
          createdBy: ctx.userId,
        }, tx);
        await runs.setLineExpense(line.id, expense.id, tx);
      }
      await runs.markPosted(runId, tx);
    });

    return this.getById(ctx, runId);
  }
}
