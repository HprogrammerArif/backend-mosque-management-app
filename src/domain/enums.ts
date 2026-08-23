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
