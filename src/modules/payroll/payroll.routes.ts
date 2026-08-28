import { z } from 'zod';
import {
  createStaffSchema, staffResponseSchema,
  createPayrollRunSchema, payrollRunResponseSchema, payrollLineResponseSchema,
} from './payroll.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { createRequireFeature } from '../../middleware/require-feature.js';
import { StaffController } from './staff.controller.js';
import type { StaffService } from './staff.service.js';
import { PayrollController } from './payroll.controller.js';
import type { PayrollService } from './payroll.service.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';
import type { SubscriptionRepository } from '../billing/ports/subscription.repository.js';
import type { PlanRepository } from '../billing/ports/plan.repository.js';

export type PayrollRouteDeps = {
  staff: StaffService;
  payroll: PayrollService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
  subscriptions: SubscriptionRepository;
  plans: PlanRepository;
};

export function payrollRoutes(deps: PayrollRouteDeps): RouteDefinition[] {
  const sc = new StaffController(deps.staff);
  const pc = new PayrollController(deps.payroll);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);
  // Staff records and running payroll are Admin/Treasurer actions.
  const requireRunner = createRequireRole('ADMIN', 'TREASURER');
  // Actually running payroll (not just keeping staff records) is a PRO-plan feature.
  const requirePayrollFeature = createRequireFeature('PAYROLL', deps.subscriptions, deps.plans);

  return [
    { method: 'POST', path: '/api/v1/mosques/:mosqueId/staff', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, requireRunner,
        validate({ body: createStaffSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: sc.create,
      docs: { summary: 'Add a staff record', body: createStaffSchema, response: staffResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/staff', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: sc.listActive,
      docs: { summary: 'List active staff', response: z.array(staffResponseSchema) } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/staff/:staffId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: sc.getById,
      docs: { summary: 'Get a staff record', response: staffResponseSchema } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/payroll/runs', permission: 'TENANT_SCOPED',
      feature: 'PAYROLL',
      middleware: [
        requireAuth, tenantGuard, requireRunner, requirePayrollFeature,
        validate({ body: createPayrollRunSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: pc.createRun,
      docs: { summary: 'Generate a payroll run for a period (PRO plan)', body: createPayrollRunSchema, response: payrollRunResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/payroll/runs/:runId', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: pc.getRun,
      docs: { summary: 'Get a payroll run', response: payrollRunResponseSchema } },

    { method: 'GET', path: '/api/v1/mosques/:mosqueId/payroll/runs/:runId/lines', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: pc.listLines,
      docs: { summary: 'List a payroll run\'s lines (for review)', response: z.array(payrollLineResponseSchema) } },

    { method: 'POST', path: '/api/v1/mosques/:mosqueId/payroll/runs/:runId/post', permission: 'TENANT_SCOPED',
      feature: 'PAYROLL',
      middleware: [requireAuth, tenantGuard, requireRunner, requirePayrollFeature, createRequireIdempotency(deps.idempotency)],
      handler: pc.postRun,
      docs: { summary: 'Post a payroll run to the expense ledger (PRO plan)', response: payrollRunResponseSchema } },
  ];
}
