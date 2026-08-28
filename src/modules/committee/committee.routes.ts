import { z } from 'zod';
import { createCommitteeMemberSchema, committeeMemberResponseSchema } from './committee.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { CommitteeController } from './committee.controller.js';
import type { CommitteeService } from './committee.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type CommitteeRouteDeps = {
  committee: CommitteeService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function committeeRoutes(deps: CommitteeRouteDeps): RouteDefinition[] {
  const c = new CommitteeController(deps.committee);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  // Roster changes are Admin/Committee actions; everyone with tenant access can view.
  const requireRosterEditor = createRequireRole('ADMIN', 'COMMITTEE');

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/committee', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRosterEditor,
        validate({ body: createCommitteeMemberSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.create,
      docs: { summary: 'Add a committee roster entry', body: createCommitteeMemberSchema, response: committeeMemberResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/committee', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listActive,
      docs: { summary: 'List active committee members', response: z.array(committeeMemberResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/committee/:memberId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get a committee member', response: committeeMemberResponseSchema } },
  ];
}
