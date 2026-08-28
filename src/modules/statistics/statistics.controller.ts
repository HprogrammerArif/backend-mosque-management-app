import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { StatisticsService } from './statistics.service.js';

export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  incomeExpenditure = (ctx: Ctx) => this.statistics.incomeExpenditure(
    mustTenant(ctx), ctx.query.get('from') ?? '', ctx.query.get('to') ?? '',
  );

  fundBalances = (ctx: Ctx) => this.statistics.fundBalances(mustTenant(ctx));

  donationTrends = (ctx: Ctx) => {
    const monthsParam = ctx.query.get('months');
    const months = monthsParam === null ? undefined : Number(monthsParam);
    return this.statistics.donationTrends(mustTenant(ctx), months);
  };
}
