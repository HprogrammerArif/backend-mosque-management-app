import type { Ctx } from '../../http/types.js';
import { mustUser, mustTenant } from '../../http/context.js';
import type { CreateInvitationRequest, UpdateMembershipRequest } from './invitations.schemas.js';
import type { InvitationsService } from './invitations.service.js';

export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  invite = (ctx: Ctx) => this.invitations.invite(
    mustTenant(ctx).tenantId, mustUser(ctx).sub, ctx.body as CreateInvitationRequest,
  );

  accept = (ctx: Ctx) => this.invitations.accept(
    ctx.params['token'] ?? '', mustUser(ctx).sub,
  );

  listMembers = (ctx: Ctx) => this.invitations.listMembers(mustTenant(ctx).tenantId);

  updateMembership = (ctx: Ctx) => this.invitations.updateMembership(
    mustTenant(ctx).tenantId, ctx.params['membershipId'] ?? '', ctx.body as UpdateMembershipRequest,
  );
}
