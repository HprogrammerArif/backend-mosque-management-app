import type { DuesChargeStatus } from '../../../domain/enums.js';

export type DuesChargeRecord = {
  id: string;
  householdId: string;
  period: string;
  amountMinor: number;
  paidMinor: number;
  currency: string;
  dueOn: string;
  status: DuesChargeStatus;
  waivedBy: string | null;
  waivedReason: string | null;
};

export type CreateDuesChargeInput = {
  id: string;
  householdId: string;
  period: string;
  amountMinor: number;
  currency: string;
  dueOn: string;
  createdBy: string;
};

/** Tenant-owned (VPD-protected). Mutable — status/paidMinor recompute as payments land. */
export interface DuesChargeRepository {
  findById(id: string): Promise<DuesChargeRecord | null>;
  findByHouseholdAndPeriod(householdId: string, period: string): Promise<DuesChargeRecord | null>;
  listByPeriod(period: string): Promise<DuesChargeRecord[]>;
  listByHousehold(householdId: string): Promise<DuesChargeRecord[]>;
  create(input: CreateDuesChargeInput): Promise<DuesChargeRecord>;
  applyPayment(id: string, amountMinor: number): Promise<void>;
  waive(id: string, waivedBy: string, reason: string): Promise<void>;
}
