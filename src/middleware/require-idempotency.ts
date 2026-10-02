import type { Middleware } from '../http/types.js';
import { AppError } from '../common/errors/app-error.js';
import { sendJson } from '../http/send.js';

export type StoredResponse = { status: number; payload: unknown };

export interface IdempotencyStore {
  get(key: string): Promise<StoredResponse | null>;
  set(key: string, value: StoredResponse): Promise<void>;
  getInFlight?(key: string): Promise<StoredResponse | null> | undefined;
  setInFlight?(key: string, promise: Promise<StoredResponse | null>): void;
  clearInFlight?(key: string): void;
}

/**
 * In-memory idempotency store with TTL (default: 24h), capacity-bounded eviction,
 * and concurrent in-flight promise tracking to prevent duplicate execution races.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #map = new Map<string, { response: StoredResponse; expiresAt: number }>();
  readonly #inFlight = new Map<string, Promise<StoredResponse | null>>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;

  constructor(options?: { ttlMs?: number; maxEntries?: number }) {
    this.#ttlMs = options?.ttlMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.#maxEntries = options?.maxEntries ?? 10_000;
  }

  async get(key: string): Promise<StoredResponse | null> {
    const entry = this.#map.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.#map.delete(key);
      return null;
    }
    return entry.response;
  }

  async set(key: string, value: StoredResponse): Promise<void> {
    if (this.#map.size >= this.#maxEntries) {
      const now = Date.now();
      for (const [k, v] of this.#map.entries()) {
        if (now > v.expiresAt || this.#map.size >= this.#maxEntries) {
          this.#map.delete(k);
        }
      }
    }
    this.#map.set(key, {
      response: value,
      expiresAt: Date.now() + this.#ttlMs,
    });
  }

  getInFlight(key: string): Promise<StoredResponse | null> | undefined {
    return this.#inFlight.get(key);
  }

  setInFlight(key: string, promise: Promise<StoredResponse | null>): void {
    this.#inFlight.set(key, promise);
  }

  clearInFlight(key: string): void {
    this.#inFlight.delete(key);
  }
}

// Named createRequireIdempotency, not requireIdempotency — see the comment on
// createRequireAuth in require-auth.ts for why a factory must not share its
// returned function's name.
export function createRequireIdempotency(store: IdempotencyStore): Middleware {
  return async function requireIdempotency(ctx, next) {
    const key = ctx.req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length === 0) {
      // A missing required header is a malformed request, not a validation
      // failure — hence 400 rather than VALIDATION_FAILED's 422.
      throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
    }

    const scoped = `${ctx.method}:${ctx.path}:${key}`;

    // 1. Check if already completed and stored
    const stored = await store.get(scoped);
    if (stored) {
      ctx.res.setHeader('idempotency-replayed', 'true');
      sendJson(ctx, stored.status, stored.payload);
      return;                                  // do not call next — the work already happened
    }

    // 2. Check if an identical request is currently in-flight
    if (store.getInFlight) {
      const inFlightPromise = store.getInFlight(scoped);
      if (inFlightPromise) {
        const inFlightResult = await inFlightPromise;
        if (inFlightResult) {
          ctx.res.setHeader('idempotency-replayed', 'true');
          sendJson(ctx, inFlightResult.status, inFlightResult.payload);
          return;
        }
      }
    }

    // 3. Register in-flight execution promise so concurrent races await this handler
    let resolveInFlight: ((res: StoredResponse | null) => void) | undefined;
    if (store.setInFlight) {
      const promise = new Promise<StoredResponse | null>((resolve) => {
        resolveInFlight = resolve;
      });
      store.setInFlight(scoped, promise);
    }

    try {
      // Capture what the handler produced so a retry replays it.
      const originalEnd = ctx.res.end.bind(ctx.res);
      let captured: string | undefined;
      ctx.res.end = ((chunk?: unknown, ...rest: unknown[]) => {
        if (typeof chunk === 'string') captured = chunk;
        return originalEnd(chunk as never, ...(rest as never[]));
      }) as typeof ctx.res.end;

      await next();

      if (captured !== undefined && ctx.res.statusCode < 400) {
        const parsed = { status: ctx.res.statusCode, payload: JSON.parse(captured) };
        await store.set(scoped, parsed);
        resolveInFlight?.(parsed);
      } else {
        resolveInFlight?.(null);
      }
    } catch (err) {
      resolveInFlight?.(null);
      throw err;
    } finally {
      store.clearInFlight?.(scoped);
    }
  };
}
