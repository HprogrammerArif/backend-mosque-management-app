import type { Role } from '../../../domain/enums.js';

export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

export type MembershipRecord = {
  id: string;
  mosqueId: string;
  userId: string;
  role: Role;
  status: MembershipStatus;
};

export type CreateMembershipInput = {
  id: string;
  mosqueId: string;
  userId: string;
  role: Role;
};

/** Global table — no `tenantId` scoping, mirrors UserRepository's port shape (ADR-0002). */
export interface MembershipRepository {
  findActive(mosqueId: string, userId: string): Promise<MembershipRecord | null>;
  findById(id: string): Promise<MembershipRecord | null>;
  create(input: CreateMembershipInput): Promise<MembershipRecord>;
  listByMosque(mosqueId: string): Promise<MembershipRecord[]>;
  countActiveAdmins(mosqueId: string): Promise<number>;
  updateRole(id: string, role: Role): Promise<void>;
  updateStatus(id: string, status: MembershipStatus): Promise<void>;
}
