import {
  createInvitationSchema, invitationResponseSchema, updateMembershipSchema, membershipResponseSchema,
} from './invitations.schemas.js';
import type { RouteDefinition, Middleware } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { AppError } from '../../common/errors/app-error.js';
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

/**
 * ADMIN/TREASURER only — an invitation is a privileged action, not open to every member.
 * Factory name deliberately differs from the returned function's name — see
 * createRequireAuth's note on why a same-named pair breaks under esbuild's dev transform.
 */
function createRequireInviterRole(): Middleware {
  return async function requireInviterRole(ctx, next) {
    const role = ctx.tenant?.role;
    if (role !== 'ADMIN' && role !== 'TREASURER') {
      throw new AppError('PERM_ROLE_REQUIRED', 'Only Admin or Treasurer can invite members');
    }
    await next();
  };
}

/** ADMIN only — role/status changes on other memberships. */
function createRequireAdminRole(): Middleware {
  return async function requireAdminRole(ctx, next) {
    if (ctx.tenant?.role !== 'ADMIN') {
      throw new AppError('PERM_ROLE_REQUIRED', 'Only Admin can change membership roles or status');
    }
    await next();
  };
}

export function invitationsRoutes(deps: InvitationsRouteDeps): RouteDefinition[] {
  const c = new InvitationsController(deps.invitations);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/invitations', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireInviterRole(),
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
      docs: { summary: 'List a mosque\'s members' } },

    { method: 'PATCH', path: '/api/v1/mosques/:mosqueId/members/:membershipId', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireAdminRole(),
        validate({ body: updateMembershipSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.updateMembership,
      docs: { summary: 'Change a member\'s role or status', body: updateMembershipSchema } },
  ];
}
