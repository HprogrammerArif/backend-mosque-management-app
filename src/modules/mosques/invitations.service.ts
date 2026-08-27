import { randomBytes, createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { InvitationRepository } from './ports/invitation.repository.js';
import type { MembershipRepository, MembershipRecord } from './ports/membership.repository.js';
import type { CreateInvitationRequest, UpdateMembershipRequest } from './invitations.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class InvitationsService {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  async invite(
    mosqueId: string, invitedBy: string, input: CreateInvitationRequest,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = `inv_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.invitations.create({
      id: uuidv7(), mosqueId, invitedBy, expiresAt,
      emailOrPhone: input.emailOrPhone, role: input.role, tokenHash: sha256(token),
    });
    return { token, expiresAt };
  }

  async accept(token: string, userId: string): Promise<MembershipRecord> {
    const invitation = await this.invitations.findByTokenHash(sha256(token));
    if (!invitation) throw new AppError('NOT_FOUND', 'Invitation not found');
    if (invitation.acceptedAt !== null) {
      throw new AppError('INVITATION_ALREADY_ACCEPTED', 'Invitation has already been accepted');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new AppError('INVITATION_EXPIRED', 'Invitation has expired');
    }
    const membership = await this.memberships.create({
      id: uuidv7(), mosqueId: invitation.mosqueId, userId, role: invitation.role,
    });
    await this.invitations.markAccepted(invitation.id);
    return membership;
  }

  async listMembers(mosqueId: string): Promise<MembershipRecord[]> {
    return this.memberships.listByMosque(mosqueId);
  }

  /** BR-10: a mosque always has at least one Admin — SQL can't express this, so it's checked here. */
  async updateMembership(
    mosqueId: string, membershipId: string, patch: UpdateMembershipRequest,
  ): Promise<MembershipRecord> {
    const membership = await this.memberships.findById(membershipId);
    if (!membership || membership.mosqueId !== mosqueId) {
      throw new AppError('NOT_FOUND', 'Membership not found');
    }

    const losingAdmin = membership.role === 'ADMIN' && membership.status === 'ACTIVE'
      && ((patch.role !== undefined && patch.role !== 'ADMIN')
        || (patch.status !== undefined && patch.status !== 'ACTIVE'));

    if (losingAdmin) {
      const activeAdmins = await this.memberships.countActiveAdmins(mosqueId);
      if (activeAdmins <= 1) {
        throw new AppError('RULE_LAST_ADMIN', 'A mosque must always have at least one Admin');
      }
    }

    if (patch.role !== undefined) await this.memberships.updateRole(membershipId, patch.role);
    if (patch.status !== undefined) await this.memberships.updateStatus(membershipId, patch.status);

    const updated = await this.memberships.findById(membershipId);
    if (!updated) throw new Error(`Membership ${membershipId} vanished immediately after update`);
    return updated;
  }
}
