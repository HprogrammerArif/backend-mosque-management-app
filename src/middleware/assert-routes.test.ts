import { describe, it, expect } from 'vitest';
import { Router } from '../http/router.js';
import { assertRouteTableIsSound } from './assert-routes.js';
import type { Middleware } from '../http/types.js';

// The assertion inspects Function.name, so these stand in for the real middleware.
// Plain function declarations, not `const x: T = async function x() {}` — the latter
// pattern (same name on the outer binding and the inner named function expression)
// gets corrupted by esbuild's dev transform, which renames the inner function to
// avoid a same-scope collision and silently breaks .name (observed: 'requireAuth2').
// The real middleware in require-auth.ts is unaffected — it is a factory function
// returning an inner function whose name lives in a different scope from the
// factory's own name, so there is nothing to collide.
async function requireAuth(_ctx: Parameters<Middleware>[0], next: Parameters<Middleware>[1]) { await next(); }
async function requireIdempotency(_ctx: Parameters<Middleware>[0], next: Parameters<Middleware>[1]) { await next(); }

describe('assertRouteTableIsSound', () => {
  it('accepts a public GET with no guards', () => {
    const r = new Router();
    r.add({ method: 'GET', path: '/health', permission: 'PUBLIC', middleware: [], handler: () => ({}) });
    expect(() => assertRouteTableIsSound(r)).not.toThrow();
  });

  it('rejects an authenticated route that forgot requireAuth', () => {
    const r = new Router();
    r.add({ method: 'GET', path: '/api/v1/auth/me', permission: 'AUTHENTICATED',
            middleware: [], handler: () => ({}) });
    expect(() => assertRouteTableIsSound(r)).toThrow(/missing requireAuth/);
  });

  it('rejects an authenticated mutation that forgot requireIdempotency', () => {
    const r = new Router();
    r.add({ method: 'POST', path: '/api/v1/donations', permission: 'AUTHENTICATED',
            middleware: [requireAuth], handler: () => ({}) });
    expect(() => assertRouteTableIsSound(r)).toThrow(/missing requireIdempotency/);
  });

  it('accepts a fully guarded authenticated mutation', () => {
    const r = new Router();
    r.add({ method: 'POST', path: '/api/v1/donations', permission: 'AUTHENTICATED',
            middleware: [requireAuth, requireIdempotency], handler: () => ({}) });
    expect(() => assertRouteTableIsSound(r)).not.toThrow();
  });

  it('exempts public mutations from idempotency', () => {
    const r = new Router();
    r.add({ method: 'POST', path: '/api/v1/auth/login', permission: 'PUBLIC',
            middleware: [], handler: () => ({}) });
    expect(() => assertRouteTableIsSound(r)).not.toThrow();
  });

  it('reports every problem at once, not just the first', () => {
    const r = new Router();
    r.add({ method: 'GET',  path: '/a', permission: 'AUTHENTICATED', middleware: [], handler: () => ({}) });
    r.add({ method: 'POST', path: '/b', permission: 'AUTHENTICATED', middleware: [], handler: () => ({}) });
    try {
      assertRouteTableIsSound(r);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).toContain('/a');
      expect((e as Error).message).toContain('/b');
    }
  });
});
