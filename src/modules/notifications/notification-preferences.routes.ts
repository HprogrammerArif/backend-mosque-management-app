import {
  updateNotificationPreferencesSchema, notificationPreferencesResponseSchema,
} from './notification-preferences.schemas.js';
import type { RouteDefinition } from '../../http/types.js';
import { createRequireAuth } from '../../middleware/require-auth.js';
import { validate } from '../../middleware/validate.js';
import { createRequireIdempotency, type IdempotencyStore } from '../../middleware/require-idempotency.js';
import { NotificationPreferencesController } from './notification-preferences.controller.js';
import type { NotificationPreferencesService } from './notification-preferences.service.js';
import type { TokenService } from '../auth/token.service.js';

export type NotificationPreferencesRouteDeps = {
  preferences: NotificationPreferencesService;
  tokens: TokenService;
  idempotency: IdempotencyStore;
};

export function notificationPreferencesRoutes(deps: NotificationPreferencesRouteDeps): RouteDefinition[] {
  const c = new NotificationPreferencesController(deps.preferences);
  const requireAuth = createRequireAuth(deps.tokens);

  return [
    { method: 'GET', path: '/api/v1/me/notification-preferences', permission: 'AUTHENTICATED',
      middleware: [requireAuth], handler: c.get,
      docs: { summary: 'Current user\'s notification preferences (defaults if never set)', response: notificationPreferencesResponseSchema } },

    { method: 'PUT', path: '/api/v1/me/notification-preferences', permission: 'AUTHENTICATED',
      middleware: [
        requireAuth, validate({ body: updateNotificationPreferencesSchema }), createRequireIdempotency(deps.idempotency),
      ],
      handler: c.update,
      docs: { summary: 'Replace notification preferences', body: updateNotificationPreferencesSchema, response: notificationPreferencesResponseSchema } },
  ];
}
