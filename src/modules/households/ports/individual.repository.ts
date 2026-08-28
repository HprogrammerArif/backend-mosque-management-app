import type { Relation } from '../../../domain/enums.js';

export type IndividualRecord = {
  id: string;
  householdId: string;
  userId: string | null;
  fullName: string;
  relation: Relation;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
};

export type CreateIndividualInput = {
  id: string;
  householdId: string;
  userId: string | null;
  fullName: string;
  relation: Relation;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  createdBy: string;
};

/** Tenant-owned (VPD-protected) — see the 0008 migration's INDIVIDUALS_TENANT_POLICY. */
export interface IndividualRepository {
  listByHousehold(householdId: string): Promise<IndividualRecord[]>;
  create(input: CreateIndividualInput): Promise<IndividualRecord>;
}
