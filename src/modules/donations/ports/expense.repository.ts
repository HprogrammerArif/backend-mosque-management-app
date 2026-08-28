import type { DonationMethod } from '../../../domain/enums.js';
import type { Currency } from '../../../domain/money.js';

export type ApprovalStatus = 'DRAFT' | 'PENDING' | 'POSTED' | 'REJECTED';

export type ExpenseRecord = {
  id: string;
  fundId: string;
  categoryId: string;
  amountMinor: number;
  currency: Currency;
  occurredOn: string;
  payee: string | null;
  description: string | null;
  method: DonationMethod;
  approvalStatus: ApprovalStatus;
  adjustsId: string | null;
  adjustmentReason: string | null;
  createdBy: string;
  createdAt: string;
};

export type CreateExpenseInput = {
  id: string;
  fundId: string;
  categoryId: string;
  amountMinor: number;
  currency: Currency;
  occurredOn: string;
  payee: string | null;
  description: string | null;
  method: DonationMethod;
  adjustsId: string | null;
  adjustmentReason: string | null;
  createdBy: string;
};

/** Tenant-owned (VPD-protected). Append-only — see the DB trigger on EXPENSES. */
export interface ExpenseRepository {
  findById(id: string): Promise<ExpenseRecord | null>;
  listRecent(limit: number): Promise<ExpenseRecord[]>;
  create(input: CreateExpenseInput): Promise<ExpenseRecord>;
}
