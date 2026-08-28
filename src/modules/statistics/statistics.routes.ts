import { z } from 'zod';
import {
  incomeExpenditureQuerySchema, incomeExpenditureResponseSchema,
  fundBalanceResponseSchema, donationTrendResponseSchema,
} from './statistics.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { validate } from '../../middleware/validate.js';
import { StatisticsController } from './statistics.controller.js';
import type { StatisticsService } from './statistics.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type StatisticsRouteDeps = {
  statistics: StatisticsService;
  tokens: TokenService;
  memberships: MembershipRepository;
};

export function statisticsRoutes(deps: StatisticsRouteDeps): RouteDefinition[] {
  const c = new StatisticsController(deps.statistics);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'GET', path: '/api/v1/mosques/:mosqueId/statistics/income-expenditure', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard, validate({ query: incomeExpenditureQuerySchema })],
      handler: c.incomeExpenditure,
      docs: { summary: 'Income vs expenditure for a date range', response: incomeExpenditureResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/statistics/fund-balances', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.fundBalances,
      docs: { summary: 'Fund balances (donations minus expenses per fund)', response: z.array(fundBalanceResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/statistics/donation-trends', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.donationTrends,
      docs: { summary: 'Monthly donation totals for the last N months', response: z.array(donationTrendResponseSchema) } },
  ];
}
