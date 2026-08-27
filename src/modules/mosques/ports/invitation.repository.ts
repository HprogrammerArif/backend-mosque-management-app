import type { Role } from '../../../domain/enums.js';

export type InvitationRecord = {
  id: string;
  mosqueId: string;
  emailOrPhone: string;
  role: Role;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
};

export type CreateInvitationInput = {
  id: string;
  mosqueId: string;
  emailOrPhone: string;
  role: Role;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
};

/** Global table — an invitation exists before the invitee has any membership. */
export interface InvitationRepository {
  findByTokenHash(tokenHash: string): Promise<InvitationRecord | null>;
  create(input: CreateInvitationInput): Promise<InvitationRecord>;
  markAccepted(id: string): Promise<void>;
}
