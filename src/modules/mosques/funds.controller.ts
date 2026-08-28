import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { SetFundCorpusRequest } from './funds.schemas.js';
import type { FundsService } from './funds.service.js';

export class FundsController {
  constructor(private readonly funds: FundsService) {}

  listMine = (ctx: Ctx) => this.funds.listMine(mustTenant(ctx));

  setCorpus = (ctx: Ctx) => this.funds.setCorpus(
    mustTenant(ctx), ctx.params['fundId'] ?? '', ctx.body as SetFundCorpusRequest,
  );
}
