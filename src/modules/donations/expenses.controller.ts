import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateExpenseRequest } from './expenses.schemas.js';
import type { ExpensesService } from './expenses.service.js';

type AdjustBody = { reason: string };

export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  record = (ctx: Ctx) => this.expenses.record(mustTenant(ctx), ctx.body as CreateExpenseRequest);

  getById = (ctx: Ctx) => this.expenses.getById(mustTenant(ctx), ctx.params['expenseId'] ?? '');

  listRecent = (ctx: Ctx) => this.expenses.listRecent(mustTenant(ctx));

  adjust = (ctx: Ctx) => this.expenses.adjust(
    mustTenant(ctx), ctx.params['expenseId'] ?? '', (ctx.body as AdjustBody).reason,
  );
}
