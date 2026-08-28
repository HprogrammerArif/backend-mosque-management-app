export type AsnafCategory =
  | 'FUQARA' | 'MASAKIN' | 'AMILIN' | 'MUALLAFAT'
  | 'RIQAB' | 'GHARIMIN' | 'FI_SABILILLAH' | 'IBN_SABIL';

export type ExpenseCategoryRecord = {
  id: string;
  name: string;
  zakatEligible: boolean;
  asnafCategory: AsnafCategory | null;
  isSystem: boolean;
};

export type CreateExpenseCategoryInput = {
  id: string;
  name: string;
  zakatEligible: boolean;
  asnafCategory: AsnafCategory | null;
  isSystem: boolean;
};

/** Tenant-owned (VPD-protected) — ZAKAT_ELIGIBLE is BR-1's anchor on the spending side. */
export interface ExpenseCategoryRepository {
  findById(id: string): Promise<ExpenseCategoryRecord | null>;
  listAll(): Promise<ExpenseCategoryRecord[]>;
  insert(input: CreateExpenseCategoryInput): Promise<ExpenseCategoryRecord>;
}
