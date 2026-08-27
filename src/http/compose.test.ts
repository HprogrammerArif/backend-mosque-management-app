import { describe, it, expect } from 'vitest';
import { compose } from './compose.js';
import type { Ctx, Middleware } from './types.js';

const ctx = {} as Ctx;

describe('compose', () => {
  it('runs middleware in order, then the handler', async () => {
    const order: string[] = [];
    const a: Middleware = async (_c, next) => { order.push('a-in'); await next(); order.push('a-out'); };
    const b: Middleware = async (_c, next) => { order.push('b-in'); await next(); order.push('b-out'); };

    await compose([a, b])(ctx, () => { order.push('handler'); return undefined; });

    expect(order).toEqual(['a-in', 'b-in', 'handler', 'b-out', 'a-out']);
  });

  it('returns the handler result', async () => {
    const result = await compose([])(ctx, () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
  });

  it('short-circuits when middleware does not call next', async () => {
    let reached = false;
    const block: Middleware = async () => { /* deliberately no next() */ };

    await compose([block])(ctx, () => { reached = true; return undefined; });

    expect(reached).toBe(false);
  });

  it('propagates an error thrown by middleware', async () => {
    const boom: Middleware = async () => { throw new Error('boom'); };
    await expect(compose([boom])(ctx, () => undefined)).rejects.toThrow('boom');
  });

  it('propagates an error thrown by the handler through middleware', async () => {
    const order: string[] = [];
    const wrap: Middleware = async (_c, next) => {
      try { await next(); } catch (e) { order.push('caught'); throw e; }
    };

    await expect(compose([wrap])(ctx, () => { throw new Error('handler boom'); }))
      .rejects.toThrow('handler boom');
    expect(order).toEqual(['caught']);
  });

  it('throws when a middleware calls next twice', async () => {
    const twice: Middleware = async (_c, next) => { await next(); await next(); };
    await expect(compose([twice])(ctx, () => undefined)).rejects.toThrow(/multiple times/i);
  });
});
