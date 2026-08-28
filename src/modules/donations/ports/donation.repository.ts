import type { DonationMethod } from '../../../domain/enums.js';
import type { Currency } from '../../../domain/money.js';

export type DonationRecord = {
  id: string;
  fundId: string;
  amountMinor: number;
  currency: Currency;
  occurredOn: string;
  method: DonationMethod;
  donorHouseholdId: string | null;
  donorName: string | null;
  anonymous: boolean;
  receiptNo: string | null;
  note: string | null;
  adjustsId: string | null;
  adjustmentReason: string | null;
  createdBy: string;
  createdAt: string;
};

export type CreateDonationInput = {
  id: string;
  fundId: string;
  amountMinor: number;
  currency: Currency;
  occurredOn: string;
  method: DonationMethod;
  donorHouseholdId: string | null;
  donorName: string | null;
  anonymous: boolean;
  receiptNo: string | null;
  note: string | null;
  adjustsId: string | null;
  adjustmentReason: string | null;
  createdBy: string;
};

export type FundBalance = { fundId: string; totalMinor: number };

/**
 * Tenant-owned (VPD-protected). Append-only — DONATIONS has a DB trigger blocking
 * UPDATE (FR-DON-4); this port has no update method to match, only create() and reads.
 */
export interface DonationRepository {
  findById(id: string): Promise<DonationRecord | null>;
  listByFund(fundId: string, limit: number): Promise<DonationRecord[]>;
  listRecent(limit: number): Promise<DonationRecord[]>;
  create(input: CreateDonationInput): Promise<DonationRecord>;
  balanceByFund(): Promise<FundBalance[]>;
}
