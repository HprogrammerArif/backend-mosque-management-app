import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { UpdatePrayerConfigRequest } from './prayer-config.schemas.js';
import type { PrayerConfigService } from './prayer-config.service.js';

export class PrayerConfigController {
  constructor(private readonly prayerConfig: PrayerConfigService) {}

  get = (ctx: Ctx) => this.prayerConfig.get(mustTenant(ctx));

  update = (ctx: Ctx) => this.prayerConfig.update(mustTenant(ctx), ctx.body as UpdatePrayerConfigRequest);
}
