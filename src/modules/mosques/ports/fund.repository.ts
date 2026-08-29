import type { FundType } from '../../../domain/enums.js';
import type { Tx } from '../../../infrastructure/database/oracle.pool.js';

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
  /**
   * Lifetime donations into the fund minus lifetime expenses from it — same formula as
   * StatisticsRepository.fundBalances. Pass `tx` to read the balance on the same
   * connection/transaction as a prior `lockForUpdate`, so the figure reflects exactly
   * what's locked rather than a separate, unlocked snapshot.
   */
  currentBalance(fundId: string, tx?: Tx): Promise<number>;
  /**
   * `SELECT ... FOR UPDATE` inside `tx` — serializes concurrent spenders against the
   * same fund so a balance-vs-corpus (BR-2) or balance-vs-restriction (BR-1) check made
   * right after this call can't be invalidated by another transaction committing in
   * between the check and the write (BR-2's TOCTOU gap).
   */
  lockForUpdate(fundId: string, tx: Tx): Promise<FundRecord | null>;
}
