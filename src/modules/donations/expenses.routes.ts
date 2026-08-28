import { z } from 'zod';
import { createExpenseSchema, adjustExpenseSchema, expenseResponseSchema } from './expenses.schemas.js';
import { createExpenseCategorySchema, expenseCategoryResponseSchema } from './expense-categories.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { ExpensesController } from './expenses.controller.js';
import type { ExpensesService } from './expenses.service.js';
import { ExpenseCategoriesController } from './expense-categories.controller.js';
import type { ExpenseCategoriesService } from './expense-categories.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type ExpensesRouteDeps = {
  expenses: ExpensesService;
  expenseCategories: ExpenseCategoriesService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function expensesRoutes(deps: ExpensesRouteDeps): RouteDefinition[] {
  const c = new ExpensesController(deps.expenses);
  const cats = new ExpenseCategoriesController(deps.expenseCategories);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  const requireRecorder = createRequireRole('ADMIN', 'TREASURER');

  return [
    { method: 'GET', path: '/api/v1/mosques/:mosqueId/expense-categories', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: cats.listAll,
      docs: { summary: 'List expense categories', response: z.array(expenseCategoryResponseSchema) } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/expense-categories', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireRole('ADMIN'),
        validate({ body: createExpenseCategorySchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: cats.create,
      docs: { summary: 'Create a custom expense category', body: createExpenseCategorySchema, response: expenseCategoryResponseSchema } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/expenses', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRecorder,
        validate({ body: createExpenseSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.record,
      docs: { summary: 'Record an expense (enforces BR-1 fund restriction)', body: createExpenseSchema, response: expenseResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/expenses', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listRecent,
      docs: { summary: 'List recent expenses', response: z.array(expenseResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/expenses/:expenseId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get an expense', response: expenseResponseSchema } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/expenses/:expenseId/adjust', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRecorder,
        validate({ body: adjustExpenseSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.adjust,
      docs: { summary: 'Correct an expense with a linked adjustment entry', body: adjustExpenseSchema, response: expenseResponseSchema } },
  ];
}
