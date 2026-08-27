import type { Middleware } from '../http/types.js';
import { AppError } from '../common/errors/app-error.js';
import { sendJson } from '../http/send.js';

export type StoredResponse = { status: number; payload: unknown };

export interface IdempotencyStore {
  get(key: string): Promise<StoredResponse | null>;
  set(key: string, value: StoredResponse): Promise<void>;
}

/** Phase 1 only. Redis replaces this in Plan 4, when financial writes arrive. */
export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #map = new Map<string, StoredResponse>();
  async get(key: string): Promise<StoredResponse | null> { return this.#map.get(key) ?? null; }
  async set(key: string, value: StoredResponse): Promise<void> { this.#map.set(key, value); }
}

export function requireIdempotency(store: IdempotencyStore): Middleware {
  return async function requireIdempotency(ctx, next) {
    const key = ctx.req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length === 0) {
      // A missing required header is a malformed request, not a validation
      // failure — hence 400 rather than VALIDATION_FAILED's 422.
      throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    }

    const scoped = `${ctx.method}:${ctx.path}:${key}`;
    const stored = await store.get(scoped);
    if (stored) {
      ctx.res.setHeader('idempotency-replayed', 'true');
      sendJson(ctx, stored.status, stored.payload);
      return;                                  // do not call next — the work already happened
    }

    // Capture what the handler produced so a retry replays it.
    const originalEnd = ctx.res.end.bind(ctx.res);
    let captured: string | undefined;
    ctx.res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (typeof chunk === 'string') captured = chunk;
      return originalEnd(chunk as never, ...(rest as never[]));
    }) as typeof ctx.res.end;

    await next();

    if (captured !== undefined && ctx.res.statusCode < 400) {
      await store.set(scoped, { status: ctx.res.statusCode, payload: JSON.parse(captured) });
    }
  };
}
