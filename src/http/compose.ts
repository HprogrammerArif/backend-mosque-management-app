import type { Ctx, Handler, Middleware } from './types.js';

export function compose(
  middleware: readonly Middleware[],
): (ctx: Ctx, last: Handler) => Promise<unknown> {
  return function run(ctx, last) {
    let lastIndex = -1;
    let result: unknown;

    async function dispatch(i: number): Promise<void> {
      // A middleware calling next() twice corrupts the chain silently. Fail loudly.
      if (i <= lastIndex) throw new Error('next() called multiple times');
      lastIndex = i;

      const fn = i === middleware.length ? undefined : middleware[i];
      if (!fn) { result = await last(ctx); return; }
      await fn(ctx, () => dispatch(i + 1));
    }

    return dispatch(0).then(() => result);
  };
}
