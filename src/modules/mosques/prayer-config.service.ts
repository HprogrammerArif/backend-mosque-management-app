import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OraclePrayerConfigRepository } from '../../infrastructure/repositories/oracle/oracle-prayer-config.repository.js';
import type { PrayerConfigRecord } from './ports/prayer-config.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { UpdatePrayerConfigRequest } from './prayer-config.schemas.js';

/**
 * Launch geography is Bangladesh only, which sits entirely within the University of
 * Islamic Sciences, Karachi convention's normal range — a flat default, not a
 * latitude-band lookup table. Refine only if a mosque outside that range actually
 * signs up (the plan's own call, not preemptive generality for a one-country launch).
 */
const DEFAULT_CALCULATION_METHOD = 'KARACHI';

const DEFAULT_CONFIG: Omit<PrayerConfigRecord, 'tenantId'> = {
  calculationMethod: DEFAULT_CALCULATION_METHOD,
  fajrOffsetMin: 0, dhuhrOffsetMin: 0, asrOffsetMin: 0, maghribOffsetMin: 0, ishaOffsetMin: 0,
  fajrFixedTime: null, dhuhrFixedTime: null, asrFixedTime: null, maghribFixedTime: null, ishaFixedTime: null,
  jumuahTime: null,
};

export class PrayerConfigService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OraclePrayerConfigRepository {
    return new OraclePrayerConfigRepository(this.pool, ctx);
  }

  async get(ctx: TenantContext): Promise<PrayerConfigRecord> {
    const existing = await this.#repo(ctx).find();
    if (existing) return existing;
    // Auto-fill on first read, per the onboarding flow (multi-tenancy doc §5): a mosque
    // gets a sensible default the moment it's created, before anyone has confirmed it.
    return this.#repo(ctx).upsert(DEFAULT_CONFIG);
  }

  async update(ctx: TenantContext, input: UpdatePrayerConfigRequest): Promise<PrayerConfigRecord> {
    return this.#repo(ctx).upsert(input);
  }
}
