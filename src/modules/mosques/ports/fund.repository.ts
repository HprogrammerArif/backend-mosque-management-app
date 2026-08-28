import type { FundType } from '../../../domain/enums.js';

export type FundRecord = {
  id: string;
  tenantId: string;
  type: FundType;
  name: string;
  zakatEligible: boolean;
};

export type CreateFundInput = {
  id: string;
  type: FundType;
  name: string;
  zakatEligible: boolean;
};

/** Tenant-owned (TENANT_ID, VPD-protected) — see Task 4's FUNDS_TENANT_POLICY. */
export interface FundRepository {
  findById(id: string): Promise<FundRecord | null>;
  listMine(): Promise<FundRecord[]>;
  insert(input: CreateFundInput): Promise<FundRecord>;
}
