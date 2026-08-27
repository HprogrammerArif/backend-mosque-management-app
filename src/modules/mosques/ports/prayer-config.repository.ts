export type PrayerConfigRecord = {
  tenantId: string;
  calculationMethod: string;
  fajrOffsetMin: number;
  dhuhrOffsetMin: number;
  asrOffsetMin: number;
  maghribOffsetMin: number;
  ishaOffsetMin: number;
  fajrFixedTime: string | null;
  dhuhrFixedTime: string | null;
  asrFixedTime: string | null;
  maghribFixedTime: string | null;
  ishaFixedTime: string | null;
  jumuahTime: string | null;
};

export type UpsertPrayerConfigInput = Omit<PrayerConfigRecord, 'tenantId'>;

/** Tenant-owned (TENANT_ID is the PK) — VPD-protected, same predicate as FUNDS (Task 4). */
export interface PrayerConfigRepository {
  find(): Promise<PrayerConfigRecord | null>;
  upsert(input: UpsertPrayerConfigInput): Promise<PrayerConfigRecord>;
}
