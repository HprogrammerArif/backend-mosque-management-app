import { z } from 'zod';
import { mockSetPlanSchema, billingSummaryResponseSchema, planResponseSchema } from './billing.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { BillingController } from './billing.controller.js';
import type { BillingService } from './billing.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type BillingRouteDeps = {
  billing: BillingService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function billingRoutes(deps: BillingRouteDeps): RouteDefinition[] {
  const c = new BillingController(deps.billing);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'GET', path: '/api/v1/mosques/:mosqueId/billing/subscription', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getSummary,
      docs: { summary: 'Current subscription and entitlements', response: billingSummaryResponseSchema } },

    { method: 'GET', path: '/api/v1/billing/plans', permission: 'AUTHENTICATED',
      middleware: [requireAuth], handler: c.listPlans,
      docs: { summary: 'List available plans', response: z.array(planResponseSchema) } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/billing/mock-set-plan', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireRole('ADMIN'),
        validate({ body: mockSetPlanSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.mockSetPlan,
      docs: { summary: 'Mock billing: set the mosque\'s plan directly (no real payment — ADR-0007)', body: mockSetPlanSchema, response: billingSummaryResponseSchema } },
  ];
}
