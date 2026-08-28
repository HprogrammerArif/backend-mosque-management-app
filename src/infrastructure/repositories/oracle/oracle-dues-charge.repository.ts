import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { DuesChargeStatus } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type {
  DuesChargeRepository, DuesChargeRecord, CreateDuesChargeInput,
} from '../../../modules/dues/ports/dues-charge.repository.js';

type Row = {
  id: string; household_id: string; period: string; amount_minor: number;
  paid_minor: number; currency: string; due_on: Date; status: string;
  waived_by: string | null; waived_reason: string | null;
};

const COLUMNS = `ID, HOUSEHOLD_ID, PERIOD, AMOUNT_MINOR, PAID_MINOR, CURRENCY, DUE_ON,
  STATUS, WAIVED_BY, WAIVED_REASON`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM DUES_CHARGES WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_FIND_BY_HH_PERIOD = `
  SELECT ${COLUMNS} FROM DUES_CHARGES
   WHERE TENANT_ID = :tenantId AND HOUSEHOLD_ID = :householdId AND PERIOD = :period`;

const SQL_LIST_BY_PERIOD = `
  SELECT ${COLUMNS} FROM DUES_CHARGES WHERE TENANT_ID = :tenantId AND PERIOD = :period`;

const SQL_LIST_BY_HH = `
  SELECT ${COLUMNS} FROM DUES_CHARGES
   WHERE TENANT_ID = :tenantId AND HOUSEHOLD_ID = :householdId
   ORDER BY PERIOD DESC`;

const SQL_INSERT = `
  INSERT INTO DUES_CHARGES (ID, TENANT_ID, HOUSEHOLD_ID, PERIOD, AMOUNT_MINOR, CURRENCY, DUE_ON, CREATED_BY)
  VALUES (:id, :tenantId, :householdId, :period, :amountMinor, :currency, :dueOn, :createdBy)`;

const SQL_APPLY_PAYMENT = `
  UPDATE DUES_CHARGES
     SET PAID_MINOR = PAID_MINOR + :amountMinor,
         STATUS = CASE
           WHEN PAID_MINOR + :amountMinor >= AMOUNT_MINOR THEN 'PAID'
           WHEN PAID_MINOR + :amountMinor > 0 THEN 'PARTIAL'
           ELSE STATUS
         END
   WHERE ID = :id AND TENANT_ID = :tenantId`;

const SQL_WAIVE = `
  UPDATE DUES_CHARGES SET STATUS = 'WAIVED', WAIVED_BY = :waivedBy, WAIVED_REASON = :reason
   WHERE ID = :id AND TENANT_ID = :tenantId`;

function toRecord(row: Row): DuesChargeRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    period: row.period,
    amountMinor: Number(row.amount_minor),
    paidMinor: Number(row.paid_minor),
    currency: row.currency,
    dueOn: row.due_on.toISOString().slice(0, 10),
    status: row.status as DuesChargeStatus,
    waivedBy: row.waived_by,
    waivedReason: row.waived_reason,
  };
}

export class OracleDuesChargeRepository extends BaseRepository implements DuesChargeRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<DuesChargeRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByHouseholdAndPeriod(householdId: string, period: string): Promise<DuesChargeRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_HH_PERIOD, { householdId, period });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByPeriod(period: string): Promise<DuesChargeRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_BY_PERIOD, { period });
    return rows.map(toRecord);
  }

  async listByHousehold(householdId: string): Promise<DuesChargeRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_BY_HH, { householdId });
    return rows.map(toRecord);
  }

  async create(input: CreateDuesChargeInput): Promise<DuesChargeRecord> {
    await this.scoped(SQL_INSERT, { ...input, dueOn: new Date(input.dueOn) });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Dues charge ${input.id} vanished immediately after insert`);
    return created;
  }

  /** `tx` runs this inside the same transaction as the payment's insert (see DuesService.recordPayment). */
  async applyPayment(id: string, amountMinor: number, tx?: Tx): Promise<void> {
    const binds = { id, amountMinor, tenantId: this.ctx.tenantId };
    if (tx) {
      await tx.execute(SQL_APPLY_PAYMENT, binds);
    } else {
      await this.scoped(SQL_APPLY_PAYMENT, binds);
    }
  }

  async waive(id: string, waivedBy: string, reason: string): Promise<void> {
    await this.scoped(SQL_WAIVE, { id, waivedBy, reason });
  }
}
