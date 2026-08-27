import type { Ctx } from './types.js';

export function sendJson(ctx: Ctx, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  ctx.res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'x-request-id': ctx.requestId,
  });
  ctx.res.end(body);
}

export function sendEmpty(ctx: Ctx, status: number): void {
  ctx.res.writeHead(status, { 'x-request-id': ctx.requestId });
  ctx.res.end();
}
