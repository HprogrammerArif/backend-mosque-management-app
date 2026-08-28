import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreatePayrollRunRequest } from './payroll.schemas.js';
import type { PayrollService } from './payroll.service.js';

export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  createRun = (ctx: Ctx) => this.payroll.createRun(mustTenant(ctx), ctx.body as CreatePayrollRunRequest);

  getRun = (ctx: Ctx) => this.payroll.getById(mustTenant(ctx), ctx.params['runId'] ?? '');

  listLines = (ctx: Ctx) => this.payroll.listLines(mustTenant(ctx), ctx.params['runId'] ?? '');

  postRun = (ctx: Ctx) => this.payroll.postRun(mustTenant(ctx), ctx.params['runId'] ?? '');
}
