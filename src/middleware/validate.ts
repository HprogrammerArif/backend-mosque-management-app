import type { ZodSchema } from 'zod';
import type { Middleware } from '../http/types.js';
import { AppError } from '../common/errors/app-error.js';

function parseOrThrow(schema: ZodSchema, value: unknown, source: string): unknown {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    fields[issue.path.join('.') || '_'] = issue.message;
  }
  throw new AppError('VALIDATION_FAILED', `Invalid request ${source}`, { fields });
}

export function validate(schemas: { body?: ZodSchema; query?: ZodSchema }): Middleware {
  return async function validate(ctx, next) {
    if (schemas.body) ctx.body = parseOrThrow(schemas.body, ctx.body, 'body');
    if (schemas.query) {
      parseOrThrow(schemas.query, Object.fromEntries(ctx.query), 'query');
    }
    await next();
  };
}
