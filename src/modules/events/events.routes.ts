import { z } from 'zod';
import { createEventSchema, eventResponseSchema } from './events.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { EventsController } from './events.controller.js';
import type { EventsService } from './events.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type EventsRouteDeps = {
  events: EventsService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function eventsRoutes(deps: EventsRouteDeps): RouteDefinition[] {
  const c = new EventsController(deps.events);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  const requirePublisher = createRequireRole('ADMIN', 'COMMITTEE', 'STAFF');

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/events', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requirePublisher,
        validate({ body: createEventSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.create,
      docs: { summary: 'Create an event', body: createEventSchema, response: eventResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/events', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listUpcoming,
      docs: { summary: 'List upcoming events', response: z.array(eventResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/events/:eventId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get an event', response: eventResponseSchema } },
  ];
}
