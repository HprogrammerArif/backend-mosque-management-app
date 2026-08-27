import type { IncomingMessage, ServerResponse } from 'node:http';

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

export type RouteDefinition = {
  method: HttpMethod;
  path: string;
  permission: RoutePermission;
  middleware: Middleware[];
  handler: Handler;
};

export type MatchResult = { route: RouteDefinition; params: Record<string, string> };
