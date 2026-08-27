import { z } from 'zod';
import {
  createInvitationSchema, invitationResponseSchema, updateMembershipSchema, membershipResponseSchema,
} from './invitations.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { InvitationsController } from './invitations.controller.js';
import type { InvitationsService } from './invitations.service.js';
import type { MembershipRepository } from './ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type InvitationsRouteDeps = {
  invitations: InvitationsService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function invitationsRoutes(deps: InvitationsRouteDeps): RouteDefinition[] {
  const c = new InvitationsController(deps.invitations);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/invitations', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireRole('ADMIN', 'TREASURER'),
        validate({ body: createInvitationSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.invite,
      docs: { summary: 'Invite a member', body: createInvitationSchema, response: invitationResponseSchema } },

    { method: 'POST', path: '/api/v1/invitations/:token/accept', permission: 'AUTHENTICATED',
      middleware: [requireAuth, createRequireIdempotency(deps.idempotency)],
      handler: c.accept,
      docs: { summary: 'Accept an invitation', response: membershipResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/members', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listMembers,
      docs: { summary: 'List a mosque\'s members', response: z.array(membershipResponseSchema) } },

    { method: 'PATCH', path: '/api/v1/mosques/:mosqueId/members/:membershipId', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireRole('ADMIN'),
        validate({ body: updateMembershipSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.updateMembership,
      docs: { summary: 'Change a member\'s role or status', body: updateMembershipSchema, response: membershipResponseSchema } },
  ];
}
