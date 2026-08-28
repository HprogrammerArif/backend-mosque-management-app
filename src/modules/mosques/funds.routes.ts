import { z } from 'zod';
import { fundResponseSchema } from './funds.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { FundsController } from './funds.controller.js';
import type { FundsService } from './funds.service.js';
import type { MembershipRepository } from './ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type FundsRouteDeps = {
  funds: FundsService;
  tokens: TokenService;
  memberships: MembershipRepository;
};

export function fundsRoutes(deps: FundsRouteDeps): RouteDefinition[] {
  const c = new FundsController(deps.funds);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'GET', path: '/api/v1/mosques/:mosqueId/funds', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.listMine,
      docs: { summary: 'List the mosque\'s funds', response: z.array(fundResponseSchema) } },
  ];
}
