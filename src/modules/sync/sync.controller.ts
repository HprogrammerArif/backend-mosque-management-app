import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { BootstrapRequest, PushRequest, SyncEntity } from './sync.schemas.js';
import { SYNC_ENTITIES } from './sync.schemas.js';
import type { SyncService } from './sync.service.js';
import { AppError } from '../../common/errors/app-error.js';

export class SyncController {
  constructor(private readonly sync: SyncService) {}

  bootstrap = (ctx: Ctx) => this.sync.bootstrap(mustTenant(ctx), ctx.body as BootstrapRequest);

  push = (ctx: Ctx) => this.sync.push(mustTenant(ctx), ctx.body as PushRequest);

  pull = (ctx: Ctx) => {
    const entitiesParam = ctx.query.get('entities');
    if (entitiesParam === null || entitiesParam === '') {
      throw new AppError('VALIDATION_FAILED', 'entities query parameter is required');
    }
    const entities = entitiesParam.split(',').filter((e): e is SyncEntity =>
      (SYNC_ENTITIES as readonly string[]).includes(e));
    const since = Number(ctx.query.get('since') ?? '0');
    const limitParam = ctx.query.get('limit');
    const limit = limitParam === null ? undefined : Number(limitParam);

    return this.sync.pull(mustTenant(ctx), entities, since, limit);
  };
}
