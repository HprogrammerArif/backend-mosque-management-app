import { AppError } from '../common/errors/app-error.js';
import { sendJson } from './send.js';
import type { Ctx } from './types.js';

export type Logger = { error: (obj: unknown, msg: string) => void };

export function handleError(ctx: Ctx, error: unknown, log: Logger): void {
  if (ctx.res.headersSent) return;

  if (error instanceof AppError) {
    sendJson(ctx, error.status, {
      error: {
        code: error.code,
        message: error.message,
        requestId: ctx.requestId,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  // Never leak an unexpected error's message — it may carry schema or driver detail.
  log.error({ requestId: ctx.requestId, path: ctx.path, err: error }, 'unhandled error');
  sendJson(ctx, 500, {
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId: ctx.requestId },
  });
}
