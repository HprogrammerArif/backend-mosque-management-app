import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ZodSchema } from 'zod';

export type Ctx = {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly requestId: string;
  readonly startedAt: number;
  params: Record<string, string>;
  body: unknown;
  /** Set by requireAuth. Read through mustUser(), never directly. */
  user?: { sub: string; jti: string; did: string };
};

export type Handler = (ctx: Ctx) => Promise<unknown> | unknown;
export type Middleware = (ctx: Ctx, next: () => Promise<void>) => Promise<void>;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Widens to the full permission matrix in Plan 2, when roles exist. */
export type RoutePermission = 'PUBLIC' | 'AUTHENTICATED';

export type RouteDocs = {
  summary: string;
  body?: ZodSchema;
  response?: ZodSchema;
  status?: number;        // defaults to 201 for POST, 200 otherwise
};

export type RouteDefinition = {
  method: HttpMethod;
  path: string;
  permission: RoutePermission;
  middleware: Middleware[];
  handler: Handler;
  docs?: RouteDocs;        // additive — routes without it still work
};

export type MatchResult = { route: RouteDefinition; params: Record<string, string> };
