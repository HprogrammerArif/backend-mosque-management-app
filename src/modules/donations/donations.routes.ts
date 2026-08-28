import { z } from 'zod';
import {
  createDonationSchema, adjustDonationSchema, donationResponseSchema, fundBalanceResponseSchema,
} from './donations.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { DonationsController } from './donations.controller.js';
import type { DonationsService } from './donations.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type DonationsRouteDeps = {
  donations: DonationsService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function donationsRoutes(deps: DonationsRouteDeps): RouteDefinition[] {
  const c = new DonationsController(deps.donations);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  // Recording money is a Treasurer/Admin action; Committee can view but not write.
  const requireRecorder = createRequireRole('ADMIN', 'TREASURER');

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/donations', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRecorder,
        validate({ body: createDonationSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.record,
      docs: { summary: 'Record a donation', body: createDonationSchema, response: donationResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/donations', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listRecent,
      docs: { summary: 'List recent donations', response: z.array(donationResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/donations/balance', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.balanceByFund,
      docs: { summary: 'Fund balances (sum of donations per fund)', response: z.array(fundBalanceResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/donations/:donationId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get a donation', response: donationResponseSchema } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/donations/:donationId/adjust', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRecorder,
        validate({ body: adjustDonationSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.adjust,
      docs: { summary: 'Correct a donation with a linked adjustment entry', body: adjustDonationSchema, response: donationResponseSchema } },
  ];
}
