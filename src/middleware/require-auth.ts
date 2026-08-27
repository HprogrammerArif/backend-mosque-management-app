import type { Middleware } from '../http/types.js';
import { AppError } from '../common/errors/app-error.js';
import type { TokenService } from '../modules/auth/token.service.js';

/**
 * The RETURNED function's name is load-bearing: assertRouteTableIsSound inspects
 * Function.name to verify a non-public route actually runs it. That is also why this
 * factory is deliberately NOT itself named `requireAuth` — a same-named outer/inner
 * pair (`function requireAuth() { return function requireAuth() {} }`) gets its inner
 * function renamed by esbuild's collision-avoidance transform under Vitest (observed:
 * 'requireAuth2'), which corrupts the very check this exists to support. tsc-compiled
 * production is unaffected, but tests import real routes through the same transform,
 * so the pattern must be safe there too. Never wrap the returned function in an
 * anonymous one, and never give this factory the same name as what it returns.
 */
export function createRequireAuth(tokens: TokenService): Middleware {
  return async function requireAuth(ctx, next) {
    const header = ctx.req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('AUTH_TOKEN_INVALID', 'Missing bearer token');
    }
    ctx.user = await tokens.verifyAccess(header.slice(7));
    await next();
  };
}
