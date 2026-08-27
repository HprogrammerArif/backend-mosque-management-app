import type { Middleware } from '../http/types.js';
import { AppError } from '../common/errors/app-error.js';
import type { TokenService } from '../modules/auth/token.service.js';

/**
 * The function name is load-bearing: assertRouteTableIsSound inspects Function.name
 * to verify that a non-public route actually runs this. Do not rename or wrap it
 * in an anonymous function.
 */
export function requireAuth(tokens: TokenService): Middleware {
  return async function requireAuth(ctx, next) {
    const header = ctx.req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('AUTH_TOKEN_INVALID', 'Missing bearer token');
    }
    ctx.user = await tokens.verifyAccess(header.slice(7));
    await next();
  };
}
