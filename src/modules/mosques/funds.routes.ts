import { z } from 'zod';
import { fundResponseSchema, setFundCorpusSchema } from './funds.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { FundsController } from './funds.controller.js';
import type { FundsService } from './funds.service.js';
import type { MembershipRepository } from './ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type FundsRouteDeps = {
  funds: FundsService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function fundsRoutes(deps: FundsRouteDeps): RouteDefinition[] {
  const c = new FundsController(deps.funds);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'GET', path: '/api/v1/mosques/:mosqueId/funds', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listMine,
      docs: { summary: 'List the mosque\'s funds', response: z.array(fundResponseSchema) } },

    { method: 'PATCH', path: '/api/v1/mosques/:mosqueId/funds/:fundId/corpus', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireRole('ADMIN'),
        validate({ body: setFundCorpusSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.setCorpus,
      docs: { summary: 'Set a WAQF fund\'s protected corpus (BR-2)', body: setFundCorpusSchema, response: fundResponseSchema } },
  ];
}
