import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateHouseholdRequest } from './households.schemas.js';
import type { HouseholdsService } from './households.service.js';

export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  create = (ctx: Ctx) => this.households.create(mustTenant(ctx), ctx.body as CreateHouseholdRequest);

  listActive = (ctx: Ctx) => this.households.listActive(mustTenant(ctx));

  getById = (ctx: Ctx) => this.households.getById(mustTenant(ctx), ctx.params['householdId'] ?? '');
}
