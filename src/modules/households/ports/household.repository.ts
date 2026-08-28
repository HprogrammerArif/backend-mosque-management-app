import type { HouseholdStatus } from '../../../domain/enums.js';

export type HouseholdRecord = {
  id: string;
  name: string;
  headIndividualId: string | null;
  addressLine1: string | null;
  area: string | null;
  phone: string | null;
  monthlyDuesMinor: number;
  collectorUserId: string | null;
  exempt: boolean;
  joinedOn: string | null;
  status: HouseholdStatus;
};

export type CreateHouseholdInput = {
  id: string;
  name: string;
  addressLine1: string | null;
  area: string | null;
  phone: string | null;
  monthlyDuesMinor: number;
  collectorUserId: string | null;
  exempt: boolean;
  joinedOn: string | null;
  createdBy: string;
};

/** Tenant-owned (VPD-protected) — see the 0008 migration's HOUSEHOLDS_TENANT_POLICY. */
export interface HouseholdRepository {
  findById(id: string): Promise<HouseholdRecord | null>;
  listActive(): Promise<HouseholdRecord[]>;
  create(input: CreateHouseholdInput): Promise<HouseholdRecord>;
}
