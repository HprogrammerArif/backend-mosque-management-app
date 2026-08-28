import { createHouseholdSchema, householdResponseSchema } from './households.schemas.js';
import { createIndividualSchema, individualResponseSchema } from './individuals.schemas.js';
import { z } from 'zod';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { HouseholdsController } from './households.controller.js';
import type { HouseholdsService } from './households.service.js';
import { IndividualsController } from './individuals.controller.js';
import type { IndividualsService } from './individuals.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type HouseholdsRouteDeps = {
  households: HouseholdsService;
  individuals: IndividualsService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function householdsRoutes(deps: HouseholdsRouteDeps): RouteDefinition[] {
  const c = new HouseholdsController(deps.households);
  const ic = new IndividualsController(deps.individuals);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  const requireRegistrar = createRequireRole('ADMIN', 'TREASURER', 'COMMITTEE');

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/households', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRegistrar,
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

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/households/:householdId/individuals', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: ic.listByHousehold,
      docs: { summary: 'List a household\'s members', response: z.array(individualResponseSchema) } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/households/:householdId/individuals', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRegistrar,
        validate({ body: createIndividualSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: ic.create,
      docs: { summary: 'Add a household member', body: createIndividualSchema, response: individualResponseSchema } },
  ];
}
