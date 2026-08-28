import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateStaffRequest } from './payroll.schemas.js';
import type { StaffService } from './staff.service.js';

export class StaffController {
  constructor(private readonly staff: StaffService) {}

  create = (ctx: Ctx) => this.staff.create(mustTenant(ctx), ctx.body as CreateStaffRequest);

  listActive = (ctx: Ctx) => this.staff.listActive(mustTenant(ctx));

  getById = (ctx: Ctx) => this.staff.getById(mustTenant(ctx), ctx.params['staffId'] ?? '');
}
