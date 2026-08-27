import type { Middleware } from '../../http/types.js';
import { AppError } from '../../common/errors/app-error.js';
import type { Role } from '../../domain/enums.js';

/**
 * Runs after tenantGuard. Factory name deliberately differs from the returned
 * function's name — same esbuild dev-transform collision reason as createRequireAuth.
 */
export function createRequireRole(...roles: Role[]): Middleware {
  return async function requireRole(ctx, next) {
    const role = ctx.tenant?.role;
    if (role === undefined || !roles.includes(role)) {
      throw new AppError('PERM_ROLE_REQUIRED', `Requires one of: ${roles.join(', ')}`);
    }
    await next();
  };
}
