import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type {
  SubscriptionRepository, SubscriptionRecord, CreateSubscriptionInput, SubscriptionStatus,
} from '../../../modules/billing/ports/subscription.repository.js';

type Row = {
  id: string; mosque_id: string; plan_code: string; status: string;
  billing_period: string; price_minor: number; currency: string;
  current_period_start: Date | null; current_period_end: Date | null;
  trial_ends_at: Date | null; cancel_at_period_end: number;
  provider: string | null; provider_ref: string | null;
};

const COLUMNS = `ID, MOSQUE_ID, PLAN_CODE, STATUS, BILLING_PERIOD, PRICE_MINOR, CURRENCY,
  CURRENT_PERIOD_START, CURRENT_PERIOD_END, TRIAL_ENDS_AT, CANCEL_AT_PERIOD_END, PROVIDER, PROVIDER_REF`;

const SQL_FIND_BY_MOSQUE = `SELECT ${COLUMNS} FROM SUBSCRIPTIONS WHERE MOSQUE_ID = :mosqueId`;

const SQL_INSERT = `
  INSERT INTO SUBSCRIPTIONS (ID, MOSQUE_ID, PLAN_CODE, STATUS)
  VALUES (:id, :mosqueId, :planCode, :status)`;

const SQL_MOCK_SET_PLAN = `
  UPDATE SUBSCRIPTIONS
     SET PLAN_CODE = :planCode, STATUS = 'ACTIVE', PROVIDER = 'MOCK', PROVIDER_REF = NULL,
         CURRENT_PERIOD_START = SYSTIMESTAMP, CURRENT_PERIOD_END = SYSTIMESTAMP + 30,
         UPDATED_AT = SYSTIMESTAMP
   WHERE MOSQUE_ID = :mosqueId`;

function toRecord(row: Row): SubscriptionRecord {
  return {
    id: row.id,
    mosqueId: row.mosque_id,
    planCode: row.plan_code,
    status: row.status as SubscriptionStatus,
    billingPeriod: row.billing_period,
    priceMinor: Number(row.price_minor),
    currency: row.currency,
    currentPeriodStart: row.current_period_start === null ? null : row.current_period_start.toISOString(),
    currentPeriodEnd: row.current_period_end === null ? null : row.current_period_end.toISOString(),
    trialEndsAt: row.trial_ends_at === null ? null : row.trial_ends_at.toISOString(),
    cancelAtPeriodEnd: Number(row.cancel_at_period_end) === 1,
    provider: row.provider,
    providerRef: row.provider_ref,
  };
}

export class OracleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly pool: OraclePool) {}

  async findByMosqueId(mosqueId: string): Promise<SubscriptionRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_MOSQUE, { mosqueId });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** `tx` lets this run inside MosquesService.create's provisioning transaction. */
  async create(input: CreateSubscriptionInput, tx?: Tx): Promise<SubscriptionRecord> {
    const exec = tx ?? this.pool;
    await exec.execute(SQL_INSERT, { ...input });
    return {
      ...input,
      billingPeriod: 'MONTHLY', priceMinor: 0, currency: 'BDT',
      currentPeriodStart: null, currentPeriodEnd: null, trialEndsAt: null,
      cancelAtPeriodEnd: false, provider: null, providerRef: null,
    };
  }

  async mockSetPlan(mosqueId: string, planCode: string): Promise<SubscriptionRecord> {
    await this.pool.execute(SQL_MOCK_SET_PLAN, { mosqueId, planCode });
    const updated = await this.findByMosqueId(mosqueId);
    if (!updated) throw new Error(`Subscription for mosque ${mosqueId} vanished immediately after update`);
    return updated;
  }
}
