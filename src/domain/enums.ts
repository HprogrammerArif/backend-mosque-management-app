/**
 * Domain enumerations as `as const` objects with derived union types, rather than
 * TypeScript `enum` — avoids `enum`'s nominal-typing surprises and serialises cleanly
 * into the OpenAPI contract.
 */

export const ROLES = ['ADMIN', 'TREASURER', 'COMMITTEE', 'STAFF', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const PRAYERS = [
  'FAJR', 'DHUHR', 'ASR', 'MAGHRIB', 'ISHA',
  'JUMUAH', 'TARAWEEH', 'TAHAJJUD', 'EID_FITR', 'EID_ADHA',
] as const;
export type Prayer = (typeof PRAYERS)[number];

export const FUND_TYPES = [
  'GENERAL', 'ZAKAT', 'SADAQAH', 'LILLAH',
  'FITRANA', 'QURBANI', 'WAQF', 'BUILDING', 'CUSTOM',
] as const;
export type FundType = (typeof FUND_TYPES)[number];

export const HOUSEHOLD_STATUSES = ['ACTIVE', 'INACTIVE', 'MOVED'] as const;
export type HouseholdStatus = (typeof HOUSEHOLD_STATUSES)[number];

export const RELATIONS = ['HEAD', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER'] as const;
export type Relation = (typeof RELATIONS)[number];

export const DONATION_METHODS = [
  'CASH', 'BANK', 'MOBILE_MONEY', 'CARD', 'CHEQUE', 'IN_KIND',
] as const;
export type DonationMethod = (typeof DONATION_METHODS)[number];

export const DUES_CHARGE_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'WAIVED'] as const;
export type DuesChargeStatus = (typeof DUES_CHARGE_STATUSES)[number];

export const STAFF_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const PAYROLL_RUN_STATUSES = ['DRAFT', 'POSTED'] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const COMMITTEE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CommitteeStatus = (typeof COMMITTEE_STATUSES)[number];
