import type { DonationMethod } from '../../../domain/enums.js';

export type DuesPaymentRecord = {
  id: string;
  chargeId: string;
  fundId: string;
  amountMinor: number;
  currency: string;
  paidOn: string;
  method: DonationMethod;
  collectedBy: string | null;
  createdBy: string;
  createdAt: string;
};

export type CreateDuesPaymentInput = {
  id: string;
  chargeId: string;
  fundId: string;
  amountMinor: number;
  currency: string;
  paidOn: string;
  method: DonationMethod;
  collectedBy: string | null;
  createdBy: string;
};

/** Tenant-owned (VPD-protected). Append-only — see the DB trigger on DUES_PAYMENTS. */
export interface DuesPaymentRepository {
  listByCharge(chargeId: string): Promise<DuesPaymentRecord[]>;
  create(input: CreateDuesPaymentInput): Promise<DuesPaymentRecord>;
}
