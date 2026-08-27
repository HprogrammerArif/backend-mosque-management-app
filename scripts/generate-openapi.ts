import { writeFileSync } from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Router } from '../src/http/router.js';
import { ERROR_STATUS } from '../src/domain/errors.js';

export type OpenApiDocument = {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components: { schemas: Record<string, unknown> };
};

const ERROR_RESPONSE = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', enum: Object.keys(ERROR_STATUS) },
        message: { type: 'string' },
        requestId: { type: 'string' },
        details: {},
      },
    },
  },
} as const;

// $refStrategy: 'none' forces zod-to-json-schema to fully inline every schema instead
// of hoisting repeated sub-schemas (e.g. prayer-config.schemas.ts's shared offsetMinutes/
// timeOfDay validators) behind a `$ref`. Each call below embeds its result directly at a
// deeply nested path (paths -> ... -> responses -> ... -> schema); a `$ref` is always
// root-relative in JSON Schema, and there is no root-level `definitions`/`components`
// bucket collecting what each independent call would produce, so any ref-based
// deduplication produces a dangling reference openapi-typescript can't resolve.
export function buildOpenApiDocument(router: Router): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of router.routes()) {
    // node:http ':id' -> OpenAPI '{id}'
    const path = route.path.replace(/:(\w+)/g, '{$1}');
    const params = [...route.path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name, in: 'path', required: true, schema: { type: 'string' },
    }));

    const status = route.docs?.status ?? (route.method === 'POST' ? 201 : 200);

    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = {
      summary: route.docs?.summary ?? `${route.method} ${route.path}`,
      security: route.permission === 'PUBLIC' ? [] : [{ bearerAuth: [] }],
      ...(params.length > 0 ? { parameters: params } : {}),
      ...(route.docs?.body
        ? { requestBody: { required: true, content: {
              'application/json': { schema: zodToJsonSchema(route.docs.body, { target: 'openApi3', $refStrategy: 'none' }) } } } }
        : {}),
      responses: {
        [String(status)]: {
          description: 'Success',
          ...(route.docs?.response
            ? { content: { 'application/json': {
                  schema: zodToJsonSchema(route.docs.response, { target: 'openApi3', $refStrategy: 'none' }) } } }
            : {}),
        },
        default: {
          description: 'Error',
          content: { 'application/json': { schema: ERROR_RESPONSE } },
        },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: { title: 'Masjid OS API', version: '1.0.0' },
    paths,
    components: { schemas: {} },
  };
}

// Running this file writes the contract.
if (process.argv[1]?.endsWith('generate-openapi.ts')) {
  const { createApp } = await import('../src/main.js');
  const app = await createApp();
  writeFileSync('openapi.json', JSON.stringify(buildOpenApiDocument(app.router), null, 2) + '\n');
  await app.shutdown();
  await app.pool.close();
  console.log('Wrote openapi.json');
}
