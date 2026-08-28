import { z } from 'zod';
import { createAnnouncementSchema, announcementResponseSchema } from './announcements.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { AnnouncementsController } from './announcements.controller.js';
import type { AnnouncementsService } from './announcements.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type AnnouncementsRouteDeps = {
  announcements: AnnouncementsService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function announcementsRoutes(deps: AnnouncementsRouteDeps): RouteDefinition[] {
  const c = new AnnouncementsController(deps.announcements);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  const requirePublisher = createRequireRole('ADMIN', 'COMMITTEE', 'STAFF');

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/announcements', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requirePublisher,
        validate({ body: createAnnouncementSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.create,
      docs: { summary: 'Post an announcement (urgent triggers the janazah push path)', body: createAnnouncementSchema, response: announcementResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/announcements', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listRecent,
      docs: { summary: 'List recent announcements', response: z.array(announcementResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/announcements/:announcementId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get an announcement', response: announcementResponseSchema } },
  ];
}
