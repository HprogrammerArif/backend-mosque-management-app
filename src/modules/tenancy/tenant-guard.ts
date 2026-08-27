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
    // Path param first — every tenant-scoped route in this codebase carries :mosqueId,
    // so the URL is the natural source and needs no header that could disagree with it.
    // The X-Tenant-Id header remains a fallback for a route shape that has no per-mosque
    // path segment (multi-tenancy doc: "header, or the path") — none exists yet.
    const header = ctx.req.headers['x-tenant-id'];
    const tenantId = ctx.params.mosqueId ?? (typeof header === 'string' ? header : undefined);
    if (tenantId === undefined || tenantId === '') {
      throw new AppError('TENANT_ID_REQUIRED', 'No mosque ID in the path or X-Tenant-Id header');
    }
    const membership = await memberships.findActive(tenantId, user.sub);
    if (!membership) {
      throw new AppError('PERM_DENIED', 'No active membership in this mosque');
    }
    ctx.tenant = { tenantId, userId: user.sub, role: membership.role };
    await next();
  };
}
