import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateDonationRequest, AdjustDonationRequest } from './donations.schemas.js';
import type { DonationsService } from './donations.service.js';

export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  record = (ctx: Ctx) => this.donations.record(mustTenant(ctx), ctx.body as CreateDonationRequest);

  getById = (ctx: Ctx) => this.donations.getById(mustTenant(ctx), ctx.params['donationId'] ?? '');

  listRecent = (ctx: Ctx) => this.donations.listRecent(mustTenant(ctx));

  balanceByFund = (ctx: Ctx) => this.donations.balanceByFund(mustTenant(ctx));

  adjust = (ctx: Ctx) => this.donations.adjust(
    mustTenant(ctx), ctx.params['donationId'] ?? '', (ctx.body as AdjustDonationRequest).reason,
  );
}
