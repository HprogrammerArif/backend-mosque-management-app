import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { DonationMethod } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type {
  DuesPaymentRepository, DuesPaymentRecord, CreateDuesPaymentInput,
} from '../../../modules/dues/ports/dues-payment.repository.js';

type Row = {
  id: string; charge_id: string; fund_id: string; amount_minor: number; currency: string;
  paid_on: Date; method: string; collected_by: string | null; created_by: string; created_at: Date;
};

const COLUMNS = `ID, CHARGE_ID, FUND_ID, AMOUNT_MINOR, CURRENCY, PAID_ON, METHOD,
  COLLECTED_BY, CREATED_BY, CREATED_AT`;

const SQL_LIST_BY_CHARGE = `
  SELECT ${COLUMNS} FROM DUES_PAYMENTS WHERE TENANT_ID = :tenantId AND CHARGE_ID = :chargeId`;

const SQL_INSERT = `
  INSERT INTO DUES_PAYMENTS (ID, TENANT_ID, CHARGE_ID, FUND_ID, AMOUNT_MINOR, CURRENCY, PAID_ON, METHOD, COLLECTED_BY, CREATED_BY)
  VALUES (:id, :tenantId, :chargeId, :fundId, :amountMinor, :currency, :paidOn, :method, :collectedBy, :createdBy)`;

function toRecord(row: Row): DuesPaymentRecord {
  return {
    id: row.id,
    chargeId: row.charge_id,
    fundId: row.fund_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    paidOn: row.paid_on.toISOString().slice(0, 10),
    method: row.method as DonationMethod,
    collectedBy: row.collected_by,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export class OracleDuesPaymentRepository extends BaseRepository implements DuesPaymentRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async listByCharge(chargeId: string): Promise<DuesPaymentRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_BY_CHARGE, { chargeId });
    return rows.map(toRecord);
  }

  /** `tx` runs this inside the same transaction as the charge's applyPayment update. */
  async create(input: CreateDuesPaymentInput, tx?: Tx): Promise<DuesPaymentRecord> {
    const binds = { ...input, tenantId: this.ctx.tenantId, paidOn: new Date(input.paidOn) };
    if (tx) {
      await tx.execute(SQL_INSERT, binds);
    } else {
      await this.scoped(SQL_INSERT, binds);
    }
    return { ...input, createdAt: new Date().toISOString() };
  }
}
