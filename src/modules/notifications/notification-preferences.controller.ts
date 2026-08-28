import type { Ctx } from '../../http/types.js';
import { mustUser } from '../../http/context.js';
import type { UpdateNotificationPreferencesRequest } from './notification-preferences.schemas.js';
import type { NotificationPreferencesService } from './notification-preferences.service.js';

export class NotificationPreferencesController {
  constructor(private readonly preferences: NotificationPreferencesService) {}

  get = (ctx: Ctx) => this.preferences.get(mustUser(ctx).sub);

  update = (ctx: Ctx) => this.preferences.update(mustUser(ctx).sub, ctx.body as UpdateNotificationPreferencesRequest);
}
