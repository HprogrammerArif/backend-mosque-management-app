import type { Role } from '../../../domain/enums.js';
import type { Tx } from '../../../infrastructure/database/oracle.pool.js';

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
  /**
   * `SELECT ... FOR UPDATE` on every currently-active admin row for the mosque, inside
   * `tx` — a second, concurrent demotion of a different admin blocks until this
   * transaction commits or rolls back, closing BR-10's TOCTOU gap (two admins demoting
   * each other at once could otherwise both read "2 active admins" before either write
   * lands, leaving zero).
   */
  lockActiveAdmins(mosqueId: string, tx: Tx): Promise<string[]>;
  updateRole(id: string, role: Role, tx?: Tx): Promise<void>;
  updateStatus(id: string, status: MembershipStatus, tx?: Tx): Promise<void>;
}
