import type { Ctx } from '../../http/types.js';
import { mustUser, mustTenant } from '../../http/context.js';
import type { CreateMosqueRequest } from './mosques.schemas.js';
import type { MosquesService } from './mosques.service.js';

export class MosquesController {
  constructor(private readonly mosques: MosquesService) {}

  create = (ctx: Ctx) => this.mosques.create(mustUser(ctx).sub, ctx.body as CreateMosqueRequest);

  getById = (ctx: Ctx) => this.mosques.getById(mustTenant(ctx).tenantId);

  listMine = (ctx: Ctx) => this.mosques.listMine(mustUser(ctx).sub);
}
