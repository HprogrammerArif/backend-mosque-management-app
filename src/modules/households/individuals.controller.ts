import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateIndividualRequest } from './individuals.schemas.js';
import type { IndividualsService } from './individuals.service.js';

export class IndividualsController {
  constructor(private readonly individuals: IndividualsService) {}

  listByHousehold = (ctx: Ctx) => this.individuals.listByHousehold(
    mustTenant(ctx), ctx.params['householdId'] ?? '',
  );

  create = (ctx: Ctx) => this.individuals.create(
    mustTenant(ctx), ctx.params['householdId'] ?? '', ctx.body as CreateIndividualRequest,
  );
}
