import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleExpenseRepository } from '../../infrastructure/repositories/oracle/oracle-expense.repository.js';
import { OracleFundRepository } from '../../infrastructure/repositories/oracle/oracle-fund.repository.js';
import { OracleExpenseCategoryRepository } from '../../infrastructure/repositories/oracle/oracle-expense-category.repository.js';
import type { ExpenseRecord } from './ports/expense.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateExpenseRequest } from './expenses.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

const DEFAULT_LIST_LIMIT = 50;

export class ExpensesService {
  constructor(private readonly pool: OraclePool) {}

  #expenses(ctx: TenantContext): OracleExpenseRepository {
    return new OracleExpenseRepository(this.pool, ctx);
  }

  /**
   * BR-1: money in a Zakat fund may only be disbursed to a zakat-eligible expense
   * category. Both the fund and the category carry their own zakatEligible flag —
   * seeded correctly at provisioning (mosques.service.ts, expense-categories) and
   * editable afterward, so this check has to read the current value each time rather
   * than trust anything cached or inferred from names.
   */
  async record(ctx: TenantContext, input: CreateExpenseRequest): Promise<ExpenseRecord> {
    const fund = await new OracleFundRepository(this.pool, ctx).findById(input.fundId);
    if (!fund) throw new AppError('NOT_FOUND', `Fund ${input.fundId} not found`);

    const category = await new OracleExpenseCategoryRepository(this.pool, ctx).findById(input.categoryId);
    if (!category) throw new AppError('NOT_FOUND', `Expense category ${input.categoryId} not found`);

    if (fund.zakatEligible && !category.zakatEligible) {
      throw new AppError(
        'RULE_FUND_RESTRICTION_VIOLATED',
        `Fund "${fund.name}" is Zakat-restricted (BR-1) — expense category "${category.name}" is not zakat-eligible`,
      );
    }

    // BR-2: a WAQF fund's corpus is inalienable — this expense may only draw against
    // the balance ABOVE the protected corpus, never dip below it. corpusMinor is 0 for
    // every non-WAQF fund, so this is a no-op everywhere else.
    if (fund.type === 'WAQF' && fund.corpusMinor > 0) {
      const currentBalance = await new OracleFundRepository(this.pool, ctx).currentBalance(fund.id);
      const availableMinor = currentBalance - fund.corpusMinor;
      if (input.amountMinor > availableMinor) {
        throw new AppError(
          'RULE_WAQF_CORPUS_PROTECTED',
          `Fund "${fund.name}" has a protected corpus of ${fund.corpusMinor} — only ${Math.max(0, availableMinor)} is available to spend (BR-2)`,
        );
      }
    }

    return this.#expenses(ctx).create({
      id: uuidv7(),
      ...input,
      adjustsId: null,
      adjustmentReason: null,
      createdBy: ctx.userId,
    });
  }

  async getById(ctx: TenantContext, id: string): Promise<ExpenseRecord> {
    const expense = await this.#expenses(ctx).findById(id);
    if (!expense) throw new AppError('NOT_FOUND', `Expense ${id} not found`);
    return expense;
  }

  async listRecent(ctx: TenantContext, limit = DEFAULT_LIST_LIMIT): Promise<ExpenseRecord[]> {
    return this.#expenses(ctx).listRecent(limit);
  }

  /** Same append-only correction pattern as DonationsService.adjust. */
  async adjust(ctx: TenantContext, originalId: string, reason: string): Promise<ExpenseRecord> {
    const repo = this.#expenses(ctx);
    const original = await repo.findById(originalId);
    if (!original) throw new AppError('NOT_FOUND', `Expense ${originalId} not found`);

    return repo.create({
      id: uuidv7(),
      fundId: original.fundId,
      categoryId: original.categoryId,
      amountMinor: -original.amountMinor,
      currency: original.currency,
      occurredOn: original.occurredOn,
      payee: original.payee,
      description: original.description,
      method: original.method,
      adjustsId: original.id,
      adjustmentReason: reason,
      createdBy: ctx.userId,
    });
  }
}
