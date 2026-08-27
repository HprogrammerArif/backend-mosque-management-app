import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Router } from '../src/http/router.js';
import { createHttpServer } from '../src/http/server.js';
import { AppError } from '../src/common/errors/app-error.js';
import type { Server } from 'node:http';

let server: Server;
let shutdown: () => Promise<void>;

beforeAll(() => {
  const router = new Router();
  router.add({ method: 'GET', path: '/ok', permission: 'PUBLIC', middleware: [],
               handler: () => ({ status: 'ok' }) });
  router.add({ method: 'POST', path: '/echo', permission: 'PUBLIC', middleware: [],
               handler: (ctx) => ctx.body });
  router.add({ method: 'GET', path: '/items/:id', permission: 'PUBLIC', middleware: [],
               handler: (ctx) => ({ id: ctx.params['id'] }) });
  router.add({ method: 'GET', path: '/rule', permission: 'PUBLIC', middleware: [],
               handler: () => { throw new AppError('RULE_FUND_RESTRICTION_VIOLATED',
                 'Zakat funds cannot pay for a non-eligible category'); } });
  router.add({ method: 'GET', path: '/boom', permission: 'PUBLIC', middleware: [],
               handler: () => { throw new Error('unexpected'); } });
  router.add({ method: 'DELETE', path: '/gone', permission: 'PUBLIC', middleware: [],
               handler: () => undefined });

  ({ server, shutdown } = createHttpServer(router, {}));
});
afterAll(async () => { await shutdown(); });

describe('http server', () => {
  it('returns a JSON body with 200', async () => {
    const res = await request(server).get('/ok');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('echoes a parsed JSON body', async () => {
    const res = await request(server).post('/echo').send({ amountMinor: 50000 });
    expect(res.body).toEqual({ amountMinor: 50000 });
  });

  it('binds route parameters', async () => {
    const res = await request(server).get('/items/01J9ABC');
    expect(res.body).toEqual({ id: '01J9ABC' });
  });

  it('returns 204 with no body when the handler returns undefined', async () => {
    const res = await request(server).delete('/gone');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('maps AppError to its status and stable code', async () => {
    const res = await request(server).get('/rule');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RULE_FUND_RESTRICTION_VIOLATED');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('maps an unexpected error to 500 without leaking the message', async () => {
    const res = await request(server).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('unexpected');
  });

  it('returns a stable 404 shape for an unmatched route', async () => {
    const res = await request(server).get('/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('echoes a request id on every response', async () => {
    const res = await request(server).get('/ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
