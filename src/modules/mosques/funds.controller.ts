import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { FundsService } from './funds.service.js';

export class FundsController {
  constructor(private readonly funds: FundsService) {}

  listMine = (ctx: Ctx) => this.funds.listMine(mustTenant(ctx));
}
