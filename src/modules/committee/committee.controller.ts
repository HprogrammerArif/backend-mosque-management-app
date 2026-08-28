import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateCommitteeMemberRequest } from './committee.schemas.js';
import type { CommitteeService } from './committee.service.js';

export class CommitteeController {
  constructor(private readonly committee: CommitteeService) {}

  create = (ctx: Ctx) => this.committee.create(mustTenant(ctx), ctx.body as CreateCommitteeMemberRequest);

  listActive = (ctx: Ctx) => this.committee.listActive(mustTenant(ctx));

  getById = (ctx: Ctx) => this.committee.getById(mustTenant(ctx), ctx.params['memberId'] ?? '');
}
