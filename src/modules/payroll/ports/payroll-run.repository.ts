import type { PayrollRunStatus } from '../../../domain/enums.js';

export type PayrollRunRecord = {
  id: string;
  period: string;
  fundId: string;
  status: PayrollRunStatus;
  postedAt: string | null;
  createdBy: string;
  createdAt: string;
};

export type CreatePayrollRunInput = {
  id: string;
  period: string;
  fundId: string;
  createdBy: string;
};

export type PayrollLineRecord = {
  id: string;
  runId: string;
  staffId: string;
  amountMinor: number;
  currency: string;
  expenseId: string | null;
};

export type CreatePayrollLineInput = {
  id: string;
  runId: string;
  staffId: string;
  amountMinor: number;
  currency: string;
};

/** Tenant-owned (VPD-protected). Administrative, not a ledger — see 0013 migration. */
export interface PayrollRunRepository {
  findById(id: string): Promise<PayrollRunRecord | null>;
  findByPeriod(period: string): Promise<PayrollRunRecord | null>;
  create(input: CreatePayrollRunInput): Promise<PayrollRunRecord>;
  markPosted(id: string): Promise<void>;
  createLine(input: CreatePayrollLineInput): Promise<PayrollLineRecord>;
  listLines(runId: string): Promise<PayrollLineRecord[]>;
  setLineExpense(lineId: string, expenseId: string): Promise<void>;
}
