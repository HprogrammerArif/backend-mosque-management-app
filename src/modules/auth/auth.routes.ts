import { loginSchema, refreshSchema, registerSchema } from './auth.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';

export type AuthRouteDeps = {
  auth: AuthService;
  tokens: TokenService;
  idempotency: IdempotencyStore;
};

export function authRoutes(deps: AuthRouteDeps): RouteDefinition[] {
  const c = new AuthController(deps.auth);

  return [
    { method: 'POST', path: '/api/v1/auth/register', permission: 'PUBLIC',
      middleware: [validate({ body: registerSchema })], handler: c.register },

    { method: 'POST', path: '/api/v1/auth/login', permission: 'PUBLIC',
      middleware: [validate({ body: loginSchema })], handler: c.login },

    { method: 'POST', path: '/api/v1/auth/refresh', permission: 'PUBLIC',
      middleware: [validate({ body: refreshSchema })], handler: c.refresh },

    { method: 'POST', path: '/api/v1/auth/logout', permission: 'AUTHENTICATED',
      middleware: [createRequireAuth(deps.tokens), createRequireIdempotency(deps.idempotency)],
      handler: c.logout },

    { method: 'GET', path: '/api/v1/auth/me', permission: 'AUTHENTICATED',
      middleware: [createRequireAuth(deps.tokens)], handler: c.me },
  ];
}
