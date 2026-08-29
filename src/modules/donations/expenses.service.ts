import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleExpenseRepository } from '../../infrastructure/repositories/oracle/oracle-expense.repository.js';
import { OracleFundRepository } from '../../infrastructure/repositories/oracle/oracle-fund.repository.js';
import { OracleExpenseCategoryRepository } from '../../infrastructure/repositories/oracle/oracle-expense-category.repository.js';
import type { ExpenseRecord } from './ports/expense.repository.js';
import type { FundRecord } from '../mosques/ports/fund.repository.js';
import type { ExpenseCategoryRecord } from './ports/expense-category.repository.js';
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
   * BR-1 (Zakat restriction) + BR-2 (Waqf corpus protection) for a total amount about to
   * be drawn from `fund`. `fund` must have been read via `lockForUpdate` inside the same
   * `tx` this balance was computed in — otherwise two concurrent spends can each pass the
   * check against the same pre-spend balance and jointly overdraw the corpus. Shared with
   * PayrollService.postRun so a payroll run is held to exactly the same rules, under the
   * same lock, as an ad-hoc expense against the same fund.
   */
  assertWithinRules(
    fund: FundRecord, category: ExpenseCategoryRecord, totalAmountMinor: number, currentBalance: number,
  ): void {
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
      const availableMinor = currentBalance - fund.corpusMinor;
      if (totalAmountMinor > availableMinor) {
        throw new AppError(
          'RULE_WAQF_CORPUS_PROTECTED',
          `Fund "${fund.name}" has a protected corpus of ${fund.corpusMinor} — only ${Math.max(0, availableMinor)} is available to spend (BR-2)`,
        );
      }
    }
  }

  /**
   * The fund is locked (`FOR UPDATE`) for the lifetime of this transaction, so a second,
   * concurrent `record()`/`postRun()` against the same fund blocks until this one commits
   * or rolls back — the balance this checks against can't change out from under it.
   */
  async record(ctx: TenantContext, input: CreateExpenseRequest): Promise<ExpenseRecord> {
    const category = await new OracleExpenseCategoryRepository(this.pool, ctx).findById(input.categoryId);
    if (!category) throw new AppError('NOT_FOUND', `Expense category ${input.categoryId} not found`);

    return this.pool.withTenantTransaction(ctx.tenantId, async (tx) => {
      const fundRepo = new OracleFundRepository(this.pool, ctx);
      const fund = await fundRepo.lockForUpdate(input.fundId, tx);
      if (!fund) throw new AppError('NOT_FOUND', `Fund ${input.fundId} not found`);

      const currentBalance = await fundRepo.currentBalance(fund.id, tx);
      this.assertWithinRules(fund, category, input.amountMinor, currentBalance);

      return this.#expenses(ctx).create({
        id: uuidv7(),
        ...input,
        adjustsId: null,
        adjustmentReason: null,
        createdBy: ctx.userId,
      }, tx);
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
