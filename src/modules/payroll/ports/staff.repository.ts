import type { StaffStatus } from '../../../domain/enums.js';

export type StaffRecord = {
  id: string;
  name: string;
  roleTitle: string | null;
  phone: string | null;
  monthlySalaryMinor: number;
  currency: string;
  status: StaffStatus;
  joinedOn: string | null;
};

export type CreateStaffInput = {
  id: string;
  name: string;
  roleTitle: string | null;
  phone: string | null;
  monthlySalaryMinor: number;
  currency: string;
  joinedOn: string | null;
  createdBy: string;
};

/** Tenant-owned (VPD-protected). */
export interface StaffRepository {
  findById(id: string): Promise<StaffRecord | null>;
  listActive(): Promise<StaffRecord[]>;
  create(input: CreateStaffInput): Promise<StaffRecord>;
}
