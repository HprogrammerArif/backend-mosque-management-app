import { describe, it, expect } from 'vitest';
import { Router } from './router.js';
import type { RouteDefinition } from './types.js';

const route = (method: RouteDefinition['method'], path: string): RouteDefinition => ({
  method, path, permission: 'PUBLIC', middleware: [], handler: () => path,
});

describe('Router', () => {
  it('matches a static path', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/funds'));
    expect(r.match('GET', '/api/v1/funds')?.route.path).toBe('/api/v1/funds');
  });

  it('returns null for an unmatched path', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/funds'));
    expect(r.match('GET', '/api/v1/nope')).toBeNull();
  });

  it('distinguishes methods on the same path', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/funds'));
    r.add(route('POST', '/api/v1/funds'));
    expect(r.match('POST', '/api/v1/funds')?.route.method).toBe('POST');
    expect(r.match('DELETE', '/api/v1/funds')).toBeNull();
  });

  it('extracts a single named parameter', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/donations/:id'));
    expect(r.match('GET', '/api/v1/donations/01J9ABC')?.params).toEqual({ id: '01J9ABC' });
  });

  it('extracts multiple named parameters', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/mosques/:mosqueId/members/:userId'));
    expect(r.match('GET', '/api/v1/mosques/m1/members/u2')?.params)
      .toEqual({ mosqueId: 'm1', userId: 'u2' });
  });

  it('prefers a static segment over a parameter regardless of insertion order', () => {
    const r = new Router();
    r.add(route('POST', '/api/v1/donations/:id'));   // registered FIRST
    r.add(route('POST', '/api/v1/donations/bulk'));
    // A naive first-match-wins router returns the :id route here. That is the bug.
    expect(r.match('POST', '/api/v1/donations/bulk')?.route.path).toBe('/api/v1/donations/bulk');
    expect(r.match('POST', '/api/v1/donations/01J9')?.route.path).toBe('/api/v1/donations/:id');
  });

  it('does not match a prefix of a longer route', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/donations/:id/receipt'));
    expect(r.match('GET', '/api/v1/donations/01J9')).toBeNull();
  });

  it('treats a trailing slash as the same route', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/funds'));
    expect(r.match('GET', '/api/v1/funds/')?.route.path).toBe('/api/v1/funds');
  });

  it('percent-decodes parameter values', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/search/:term'));
    expect(r.match('GET', '/api/v1/search/Abdul%20Karim')?.params).toEqual({ term: 'Abdul Karim' });
  });

  it('rejects a duplicate route registration', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/funds'));
    expect(() => r.add(route('GET', '/api/v1/funds'))).toThrow(/already registered/i);
  });

  it('enumerates every registered route for the startup assertion', () => {
    const r = new Router();
    r.add(route('GET', '/api/v1/funds'));
    r.add(route('POST', '/api/v1/donations'));
    expect(r.routes()).toHaveLength(2);
  });
});
