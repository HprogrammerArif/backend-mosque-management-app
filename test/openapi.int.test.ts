import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createApp } from '../src/main.js';
import { buildOpenApiDocument } from '../scripts/generate-openapi.js';

describe('openapi contract', () => {
  it('describes every route in the table', async () => {
    const app = await createApp();
    try {
      const doc = buildOpenApiDocument(app.router);
      for (const route of app.router.routes()) {
        const path = route.path.replace(/:(\w+)/g, '{$1}');
        expect(doc.paths[path], `${route.method} ${route.path} missing`).toBeDefined();
        expect(doc.paths[path]?.[route.method.toLowerCase()]).toBeDefined();
      }
    } finally {
      await app.shutdown();
      await app.pool.close();
    }
  });

  it('emits a request body schema for routes that declare one', async () => {
    const app = await createApp();
    try {
      const doc = buildOpenApiDocument(app.router);
      const login = doc.paths['/api/v1/auth/login']?.['post'] as {
        requestBody: { content: { 'application/json': { schema: unknown } } };
      };
      expect(login.requestBody.content['application/json'].schema).toBeDefined();
    } finally {
      await app.shutdown();
      await app.pool.close();
    }
  });

  it('matches the committed openapi.json', async () => {
    // The check that actually prevents drift: if this fails, run `pnpm openapi`
    // and commit the result. CI runs this too.
    const app = await createApp();
    try {
      const generated = buildOpenApiDocument(app.router);
      const committed = JSON.parse(readFileSync('openapi.json', 'utf8'));
      expect(generated).toEqual(committed);
    } finally {
      await app.shutdown();
      await app.pool.close();
    }
  });
});
