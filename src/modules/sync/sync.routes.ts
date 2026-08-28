import { bootstrapRequestSchema, pushRequestSchema } from './sync.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { SyncController } from './sync.controller.js';
import type { SyncService } from './sync.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type SyncRouteDeps = {
  sync: SyncService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

/**
 * No :mosqueId in any of these paths (offline-sync-protocol.md §5) — tenantGuard falls
 * back to the X-Tenant-Id header here, exactly the route shape that fallback exists for
 * (Phase 2A's finding: "none of this plan's routes currently need the fallback" — this
 * is the first one that does).
 */
export function syncRoutes(deps: SyncRouteDeps): RouteDefinition[] {
  const c = new SyncController(deps.sync);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'POST', path: '/api/v1/sync/bootstrap', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, validate({ body: bootstrapRequestSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.bootstrap,
      docs: { summary: 'First sync for a tenant, or recovery after cursor loss', body: bootstrapRequestSchema } },

    { method: 'POST', path: '/api/v1/sync/push', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, validate({ body: pushRequestSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.push,
      docs: { summary: 'Push a batch of offline mutations', body: pushRequestSchema } },

    { method: 'GET', path: '/api/v1/sync/pull', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.pull,
      docs: { summary: 'Pull changes since a cursor' } },
  ];
}
