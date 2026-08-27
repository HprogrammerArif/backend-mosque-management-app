import { updatePrayerConfigSchema, prayerConfigResponseSchema } from './prayer-config.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { createTenantGuard } from '../tenancy/tenant-guard.js';
import { createRequireRole } from '../tenancy/require-role.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { PrayerConfigController } from './prayer-config.controller.js';
import type { PrayerConfigService } from './prayer-config.service.js';
import type { MembershipRepository } from './ports/membership.repository.js';
import type { TokenService } from '../auth/token.service.js';

export type PrayerConfigRouteDeps = {
  prayerConfig: PrayerConfigService;
  tokens: TokenService;
  memberships: MembershipRepository;
  idempotency: IdempotencyStore;
};

export function prayerConfigRoutes(deps: PrayerConfigRouteDeps): RouteDefinition[] {
  const c = new PrayerConfigController(deps.prayerConfig);
  const requireAuth = createRequireAuth(deps.tokens);
  const tenantGuard = createTenantGuard(deps.memberships);

  return [
    { method: 'GET', path: '/api/v1/mosques/:mosqueId/prayer-config', permission: 'TENANT_SCOPED',
      middleware: [requireAuth, tenantGuard], handler: c.get,
      docs: { summary: 'Get prayer calculation method and jamaat offsets', response: prayerConfigResponseSchema } },

    { method: 'PUT', path: '/api/v1/mosques/:mosqueId/prayer-config', permission: 'TENANT_SCOPED',
      middleware: [
        requireAuth, tenantGuard, createRequireRole('ADMIN'),
        validate({ body: updatePrayerConfigSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.update,
      docs: { summary: 'Set the calculation method and jamaat offsets', body: updatePrayerConfigSchema, response: prayerConfigResponseSchema } },
  ];
}
