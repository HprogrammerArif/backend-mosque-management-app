import type { Middleware } from '../http/types.js';
import { AppError } from '../common/errors/app-error.js';
import { mustTenant } from '../http/context.js';
import type { SubscriptionRepository } from '../modules/billing/ports/subscription.repository.js';
import type { PlanRepository } from '../modules/billing/ports/plan.repository.js';

const ENTITLED_STATUSES = new Set(['TRIALING', 'ACTIVE']);

/**
 * Same naming discipline as createRequireAuth/createTenantGuard: the factory is never
 * named the same as the middleware it returns, so esbuild's dev-transform collision
 * renaming cannot corrupt assertRouteTableIsSound's Function.name inspection.
 *
 * A missing subscription, or one that's PAST_DUE/CANCELED/EXPIRED, is treated as no
 * entitlements at all (fail closed) rather than falling back to BASIC — a lapsed mosque
 * shouldn't keep PRO features just because BASIC has none to lose.
 */
export function createRequireFeature(
  feature: string, subscriptions: SubscriptionRepository, plans: PlanRepository,
): Middleware {
  return async function requireFeature(ctx, next) {
    const tenant = mustTenant(ctx);
    const subscription = await subscriptions.findByMosqueId(tenant.tenantId);
    const entitled = subscription !== null && ENTITLED_STATUSES.has(subscription.status);
    const plan = entitled ? await plans.findByCode(subscription.planCode) : null;

    if (!plan || !plan.entitlements.features.includes(feature)) {
      throw new AppError('FEATURE_NOT_IN_PLAN', `This mosque's plan does not include ${feature}`);
    }
    await next();
  };
}
