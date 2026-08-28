import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { GenerateDuesRequest, RecordDuesPaymentRequest, WaiveDuesChargeRequest } from './dues.schemas.js';
import type { DuesService } from './dues.service.js';

export class DuesController {
  constructor(private readonly dues: DuesService) {}

  generate = (ctx: Ctx) => this.dues.generateForPeriod(mustTenant(ctx), (ctx.body as GenerateDuesRequest).period);

  listByPeriod = (ctx: Ctx) => this.dues.listByPeriod(mustTenant(ctx), ctx.query.get('period') ?? '');

  listByHousehold = (ctx: Ctx) => this.dues.listByHousehold(mustTenant(ctx), ctx.params['householdId'] ?? '');

  getById = (ctx: Ctx) => this.dues.getById(mustTenant(ctx), ctx.params['chargeId'] ?? '');

  listPayments = (ctx: Ctx) => this.dues.listPayments(mustTenant(ctx), ctx.params['chargeId'] ?? '');

  recordPayment = (ctx: Ctx) => this.dues.recordPayment(
    mustTenant(ctx), ctx.params['chargeId'] ?? '', ctx.body as RecordDuesPaymentRequest,
  );

  waive = (ctx: Ctx) => this.dues.waiveCharge(
    mustTenant(ctx), ctx.params['chargeId'] ?? '', (ctx.body as WaiveDuesChargeRequest).reason,
  );
}
