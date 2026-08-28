import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateExpenseCategoryRequest } from './expense-categories.schemas.js';
import type { ExpenseCategoriesService } from './expense-categories.service.js';

export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  listAll = (ctx: Ctx) => this.categories.listAll(mustTenant(ctx));

  create = (ctx: Ctx) => this.categories.create(mustTenant(ctx), ctx.body as CreateExpenseCategoryRequest);
}
