import { z } from 'zod';
import {
  generateDuesSchema, recordDuesPaymentSchema, waiveDuesChargeSchema,
  duesChargeResponseSchema, duesPaymentResponseSchema,
} from './dues.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { DuesController } from './dues.controller.js';
import type { DuesService } from './dues.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type DuesRouteDeps = {
  dues: DuesService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function duesRoutes(deps: DuesRouteDeps): RouteDefinition[] {
  const c = new DuesController(deps.dues);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  // Generating charges, collecting payments, and waiving are Treasurer/Admin actions.
  const requireRecorder = createRequireRole('ADMIN', 'TREASURER');

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/dues/generate', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRecorder,
        validate({ body: generateDuesSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.generate,
      docs: { summary: 'Generate dues charges for a period', body: generateDuesSchema, response: z.array(duesChargeResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/dues/charges', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listByPeriod,
      docs: { summary: 'List dues charges for a period', response: z.array(duesChargeResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/dues/charges/:chargeId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.getById,
      docs: { summary: 'Get a dues charge', response: duesChargeResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/dues/charges/:chargeId/payments', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listPayments,
      docs: { summary: 'List payments recorded against a dues charge', response: z.array(duesPaymentResponseSchema) } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/dues/charges/:chargeId/payments', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRecorder,
        validate({ body: recordDuesPaymentSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.recordPayment,
      docs: { summary: 'Record a payment against a dues charge', body: recordDuesPaymentSchema, response: duesPaymentResponseSchema } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/dues/charges/:chargeId/waive', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRecorder,
        validate({ body: waiveDuesChargeSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.waive,
      docs: { summary: 'Waive a dues charge', body: waiveDuesChargeSchema, response: duesChargeResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/households/:householdId/dues', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listByHousehold,
      docs: { summary: 'List dues charges for a household', response: z.array(duesChargeResponseSchema) } },
  ];
}
