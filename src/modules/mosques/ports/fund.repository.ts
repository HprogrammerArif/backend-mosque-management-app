import type { FundType } from '../../../domain/enums.js';

export type FundRecord = {
  id: string;
  tenantId: string;
  type: FundType;
  name: string;
  zakatEligible: boolean;
  /** BR-2: 0 for every non-WAQF fund, and for a WAQF fund with no corpus set yet. */
  corpusMinor: number;
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
  /** BR-2's corpus-adjustment entry — Admin-only, enforced at the route layer. */
  setCorpus(fundId: string, corpusMinor: number): Promise<FundRecord>;
  /** Lifetime donations into the fund minus lifetime expenses from it — same formula as StatisticsRepository.fundBalances. */
  currentBalance(fundId: string): Promise<number>;
}
