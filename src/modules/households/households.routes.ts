import { createHouseholdSchema, householdResponseSchema } from './households.schemas.js';
import { z } from 'zod';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { HouseholdsController } from './households.controller.js';
import type { HouseholdsService } from './households.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type HouseholdsRouteDeps = {
  households: HouseholdsService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function householdsRoutes(deps: HouseholdsRouteDeps): RouteDefinition[] {
  const c = new HouseholdsController(deps.households);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/households', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireRole('ADMIN', 'TREASURER', 'COMMITTEE'),
        validate({ body: createHouseholdSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.create,
      docs: { summary: 'Register a household', body: createHouseholdSchema, response: householdResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/households', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listActive,
      docs: { summary: 'List active households', response: z.array(householdResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/households/:householdId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get a household', response: householdResponseSchema } },
  ];
}
