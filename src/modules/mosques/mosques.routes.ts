import { createMosqueSchema, mosqueResponseSchema } from './mosques.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { MosquesController } from './mosques.controller.js';
import type { MosquesService } from './mosques.service.js';
import type { MembershipRepository } from './ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type MosquesRouteDeps = {
  mosques: MosquesService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function mosquesRoutes(deps: MosquesRouteDeps): RouteDefinition[] {
  const c = new MosquesController(deps.mosques);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    // No :mosqueId exists yet at creation time, so this is AUTHENTICATED, not
    // TENANT_SCOPED — there is nothing for tenantGuard to check membership against.
    { method: 'POST', path: '/api/v1/mosques', permission: 'AUTHENTICATED',
      middleware: [requireAuth, validate({ body: createMosqueSchema }), createRequireIdempotency(deps.idempotency)],
      handler: c.create,
      docs: { summary: 'Create a mosque', body: createMosqueSchema, response: mosqueResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques', permission: 'AUTHENTICATED',
      middleware: [requireAuth], handler: c.listMine,
      docs: { summary: 'List mosques the caller belongs to' } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get a mosque', response: mosqueResponseSchema } },
  ];
}
