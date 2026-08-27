import type { Middleware } from '../../http/types.js';
import { AppError } from '../../common/errors/app-error.js';
import { mustUser } from '../../http/context.js';
import type { MembershipRepository } from '../mosques/ports/membership.repository.js';

/**
 * Same naming discipline as createRequireAuth: the factory is never named the same as
 * the middleware it returns, so esbuild's dev-transform collision-avoidance renaming
 * cannot corrupt assertRouteTableIsSound's Function.name inspection.
 */
export function createTenantGuard(memberships: MembershipRepository): Middleware {
  return async function tenantGuard(ctx, next) {
    const user = mustUser(ctx);
    const tenantId = ctx.req.headers['x-tenant-id'];
    if (typeof tenantId !== 'string' || tenantId === '') {
      throw new AppError('TENANT_ID_REQUIRED', 'X-Tenant-Id header is required');
    }
    const membership = await memberships.findActive(tenantId, user.sub);
    if (!membership) {
      throw new AppError('PERM_DENIED', 'No active membership in this mosque');
    }
    ctx.tenant = { tenantId, userId: user.sub, role: membership.role };
    await next();
  };
}
