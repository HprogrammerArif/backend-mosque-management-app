import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Ctx } from './types.js';

export function createContext(
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string,
): Ctx {
  // The base is irrelevant — only pathname and searchParams are used.
  const url = new URL(req.url ?? '/', 'http://localhost');

  return {
    req, res, requestId,
    method: req.method ?? 'GET',
    path: url.pathname,
    query: url.searchParams,
    startedAt: Date.now(),
    params: {},
    body: undefined,
  };
}

/**
 * Reads ctx.user where middleware ordering guarantees it. Throws a programmer error
 * rather than returning undefined, so a route wired without requireAuth fails loudly
 * instead of silently treating the request as anonymous.
 */
export function mustUser(ctx: Ctx): NonNullable<Ctx['user']> {
  if (!ctx.user) {
    throw new Error(`Route ${ctx.method} ${ctx.path} read ctx.user without requireAuth`);
  }
  return ctx.user;
}

/** Same fail-loud shape as mustUser, for tenantGuard. */
export function mustTenant(ctx: Ctx): NonNullable<Ctx['tenant']> {
  if (!ctx.tenant) {
    throw new Error(`Route ${ctx.method} ${ctx.path} read ctx.tenant without tenantGuard`);
  }
  return ctx.tenant;
}
