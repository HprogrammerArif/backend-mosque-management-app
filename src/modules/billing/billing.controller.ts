import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { MockSetPlanRequest } from './billing.schemas.js';
import type { BillingService } from './billing.service.js';

export class BillingController {
  constructor(private readonly billing: BillingService) {}

  getSummary = (ctx: Ctx) => this.billing.getSummary(mustTenant(ctx));

  listPlans = () => this.billing.listPlans();

  mockSetPlan = (ctx: Ctx) => this.billing.mockSetPlan(mustTenant(ctx), (ctx.body as MockSetPlanRequest).planCode);
}
