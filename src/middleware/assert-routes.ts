import type { Router } from '../http/router.js';

const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Replaces a framework's guarantee that a guard cannot be forgotten. Called at startup
 * and asserted again in CI, so a missing guard is a failed build rather than an open
 * endpoint.
 */
export function assertRouteTableIsSound(router: Router): void {
  const problems: string[] = [];

  for (const route of router.routes()) {
    const names = route.middleware.map((m) => m.name);
    const where = `${route.method} ${route.path}`;

    if (route.permission !== 'PUBLIC') {
      if (!names.includes('requireAuth')) {
        problems.push(`${where}: missing requireAuth`);
      }
      if (MUTATIONS.has(route.method) && !names.includes('requireIdempotency')) {
        problems.push(`${where}: missing requireIdempotency`);
      }
    }

    if (route.permission === 'TENANT_SCOPED' && !names.includes('tenantGuard')) {
      problems.push(`${where}: missing tenantGuard`);
    }

    if (route.feature !== undefined && !names.includes('requireFeature')) {
      problems.push(`${where}: declares feature "${route.feature}" but does not enforce it`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Route table is unsound:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  }
}
