import type { CommitteeStatus } from '../../../domain/enums.js';

export type CommitteeMemberRecord = {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  termStart: string | null;
  termEnd: string | null;
  status: CommitteeStatus;
};

export type CreateCommitteeMemberInput = {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  termStart: string | null;
  termEnd: string | null;
  createdBy: string;
};

/** Tenant-owned (VPD-protected). */
export interface CommitteeMemberRepository {
  findById(id: string): Promise<CommitteeMemberRecord | null>;
  listActive(): Promise<CommitteeMemberRecord[]>;
  create(input: CreateCommitteeMemberInput): Promise<CommitteeMemberRecord>;
}
