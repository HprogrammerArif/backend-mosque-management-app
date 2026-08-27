import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import { BaseRepository } from '../base.repository.js';
import type {
  PrayerConfigRepository, PrayerConfigRecord, UpsertPrayerConfigInput,
} from '../../../modules/mosques/ports/prayer-config.repository.js';

type Row = {
  tenant_id: string; calculation_method: string;
  fajr_offset_min: number; dhuhr_offset_min: number; asr_offset_min: number;
  maghrib_offset_min: number; isha_offset_min: number;
  fajr_fixed_time: string | null; dhuhr_fixed_time: string | null; asr_fixed_time: string | null;
  maghrib_fixed_time: string | null; isha_fixed_time: string | null; jumuah_time: string | null;
};

const COLUMNS = `TENANT_ID, CALCULATION_METHOD,
  FAJR_OFFSET_MIN, DHUHR_OFFSET_MIN, ASR_OFFSET_MIN, MAGHRIB_OFFSET_MIN, ISHA_OFFSET_MIN,
  FAJR_FIXED_TIME, DHUHR_FIXED_TIME, ASR_FIXED_TIME, MAGHRIB_FIXED_TIME, ISHA_FIXED_TIME, JUMUAH_TIME`;

const SQL_FIND = `SELECT ${COLUMNS} FROM PRAYER_CONFIG WHERE TENANT_ID = :tenantId`;

// MERGE — the config either doesn't exist yet (auto-fill on first read hasn't written it)
// or does (a later PUT), and both cases go through the same statement.
const SQL_UPSERT = `
  MERGE INTO PRAYER_CONFIG target
  USING (SELECT :tenantId AS TENANT_ID FROM DUAL) src
  ON (target.TENANT_ID = src.TENANT_ID)
  WHEN MATCHED THEN UPDATE SET
    CALCULATION_METHOD = :calculationMethod,
    FAJR_OFFSET_MIN = :fajrOffsetMin, DHUHR_OFFSET_MIN = :dhuhrOffsetMin,
    ASR_OFFSET_MIN = :asrOffsetMin, MAGHRIB_OFFSET_MIN = :maghribOffsetMin,
    ISHA_OFFSET_MIN = :ishaOffsetMin,
    FAJR_FIXED_TIME = :fajrFixedTime, DHUHR_FIXED_TIME = :dhuhrFixedTime,
    ASR_FIXED_TIME = :asrFixedTime, MAGHRIB_FIXED_TIME = :maghribFixedTime,
    ISHA_FIXED_TIME = :ishaFixedTime, JUMUAH_TIME = :jumuahTime,
    UPDATED_AT = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (${COLUMNS})
    VALUES (:tenantId, :calculationMethod,
      :fajrOffsetMin, :dhuhrOffsetMin, :asrOffsetMin, :maghribOffsetMin, :ishaOffsetMin,
      :fajrFixedTime, :dhuhrFixedTime, :asrFixedTime, :maghribFixedTime, :ishaFixedTime, :jumuahTime)`;

function toRecord(row: Row): PrayerConfigRecord {
  return {
    tenantId: row.tenant_id,
    calculationMethod: row.calculation_method,
    fajrOffsetMin: Number(row.fajr_offset_min),
    dhuhrOffsetMin: Number(row.dhuhr_offset_min),
    asrOffsetMin: Number(row.asr_offset_min),
    maghribOffsetMin: Number(row.maghrib_offset_min),
    ishaOffsetMin: Number(row.isha_offset_min),
    fajrFixedTime: row.fajr_fixed_time,
    dhuhrFixedTime: row.dhuhr_fixed_time,
    asrFixedTime: row.asr_fixed_time,
    maghribFixedTime: row.maghrib_fixed_time,
    ishaFixedTime: row.isha_fixed_time,
    jumuahTime: row.jumuah_time,
  };
}

export class OraclePrayerConfigRepository extends BaseRepository implements PrayerConfigRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async find(): Promise<PrayerConfigRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async upsert(input: UpsertPrayerConfigInput): Promise<PrayerConfigRecord> {
    await this.scoped(SQL_UPSERT, { ...input });
    const found = await this.find();
    if (!found) throw new Error(`Prayer config for ${this.ctx.tenantId} vanished immediately after upsert`);
    return found;
  }
}
