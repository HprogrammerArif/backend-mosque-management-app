import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Router } from './router.js';
import { createContext } from './context.js';
import { compose } from './compose.js';
import { parseJsonBody } from './body.js';
import { sendJson, sendEmpty } from './send.js';
import { handleError, type Logger } from './error-handler.js';
import { AppError } from '../common/errors/app-error.js';
import type { Handler } from './types.js';

type Options = {
  log?: Logger & { info?: (obj: unknown, msg: string) => void };
  bodyLimitBytes?: number;
  drainTimeoutMs?: number;
};

const noopLog: Logger = { error: () => {} };

export function createHttpServer(router: Router, options: Options) {
  const log = options.log ?? noopLog;
  const drainTimeoutMs = options.drainTimeoutMs ?? 15_000;

  let inFlight = 0;
  let closing = false;

  const server: Server = createServer((req, res) => {
    inFlight++;
    res.on('close', () => { inFlight--; });

    const ctx = createContext(req, res, randomUUID());

    void (async () => {
      try {
        const matched = router.match(ctx.method, ctx.path);
        if (!matched) throw new AppError('NOT_FOUND', 'Resource not found');

        ctx.params = matched.params;

        if (['POST', 'PATCH', 'PUT'].includes(ctx.method)) {
          ctx.body = await parseJsonBody(req, options.bodyLimitBytes);
        }

        // The response is sent from INSIDE the composed chain, not after it returns —
        // so a middleware that wraps next() (idempotency capture, logging, timing) can
        // observe the actual write via ctx.res. If sendJson happened only after
        // compose() resolved, every such middleware's post-next() code would run before
        // the response existed at all.
        const sendResult: Handler = async (innerCtx) => {
          const result = await matched.route.handler(innerCtx);
          if (innerCtx.res.headersSent) return;             // a middleware already responded
          if (result === undefined) { sendEmpty(innerCtx, 204); return; }
          sendJson(innerCtx, innerCtx.method === 'POST' ? 201 : 200, result);
        };
        await compose(matched.route.middleware)(ctx, sendResult);
      } catch (error) {
        handleError(ctx, error, log);
      }
    })();
  });

  async function shutdown(): Promise<void> {
    closing = true;                     // /ready starts failing before connections stop
    await new Promise<void>((resolve) => server.close(() => { resolve(); }));

    const deadline = Date.now() + drainTimeoutMs;
    while (inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return { server, shutdown, isClosing: () => closing };
}
