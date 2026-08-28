import type { OracleSubscriptionRepository } from '../../infrastructure/repositories/oracle/oracle-subscription.repository.js';
import type { OraclePlanRepository } from '../../infrastructure/repositories/oracle/oracle-plan.repository.js';
import type { SubscriptionRecord } from './ports/subscription.repository.js';
import type { PlanRecord } from './ports/plan.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';

export type BillingSummary = { subscription: SubscriptionRecord; plan: PlanRecord };

export class BillingService {
  constructor(
    private readonly subscriptions: OracleSubscriptionRepository,
    private readonly plans: OraclePlanRepository,
  ) {}

  async getSummary(ctx: TenantContext): Promise<BillingSummary> {
    const subscription = await this.subscriptions.findByMosqueId(ctx.tenantId);
    if (!subscription) throw new AppError('NOT_FOUND', `No subscription for mosque ${ctx.tenantId}`);
    const plan = await this.plans.findByCode(subscription.planCode);
    if (!plan) throw new AppError('NOT_FOUND', `Plan ${subscription.planCode} not found`);
    return { subscription, plan };
  }

  async listPlans(): Promise<PlanRecord[]> {
    return this.plans.listActive();
  }

  /**
   * Mock billing (roadmap: "feature gating with mock billing", real checkout is
   * explicitly out of scope — ADR-0007). An Admin flips the mosque's plan directly; no
   * payment provider, no charge, no webhook. `entitlements` in the auth response and
   * `requireFeature` both read SUBSCRIPTIONS/PLANS the same way regardless of how the
   * plan got set, so swapping this for a real checkout later changes only this method.
   */
  async mockSetPlan(ctx: TenantContext, planCode: string): Promise<BillingSummary> {
    const plan = await this.plans.findByCode(planCode);
    if (!plan || !plan.active) throw new AppError('NOT_FOUND', `Plan ${planCode} not found`);

    const subscription = await this.subscriptions.mockSetPlan(ctx.tenantId, planCode);
    return { subscription, plan };
  }
}
