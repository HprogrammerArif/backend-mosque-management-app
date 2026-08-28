import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { DonationMethod } from '../../../domain/enums.js';
import type { Currency } from '../../../domain/money.js';
import { BaseRepository } from '../base.repository.js';
import type {
  DonationRepository, DonationRecord, CreateDonationInput, FundBalance,
} from '../../../modules/donations/ports/donation.repository.js';

type Row = {
  id: string; fund_id: string; amount_minor: number; currency: string;
  occurred_on: Date; method: string; donor_household_id: string | null;
  donor_name: string | null; anonymous: number; receipt_no: string | null;
  note: string | null; adjusts_id: string | null; adjustment_reason: string | null;
  created_by: string; created_at: Date;
};

const COLUMNS = `ID, FUND_ID, AMOUNT_MINOR, CURRENCY, OCCURRED_ON, METHOD,
  DONOR_HOUSEHOLD_ID, DONOR_NAME, ANONYMOUS, RECEIPT_NO, NOTE,
  ADJUSTS_ID, ADJUSTMENT_REASON, CREATED_BY, CREATED_AT`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM DONATIONS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_BY_FUND = `
  SELECT ${COLUMNS} FROM DONATIONS
   WHERE TENANT_ID = :tenantId AND FUND_ID = :fundId
   ORDER BY OCCURRED_ON DESC, CREATED_AT DESC
   FETCH FIRST :limit ROWS ONLY`;

const SQL_LIST_RECENT = `
  SELECT ${COLUMNS} FROM DONATIONS
   WHERE TENANT_ID = :tenantId
   ORDER BY OCCURRED_ON DESC, CREATED_AT DESC
   FETCH FIRST :limit ROWS ONLY`;

const SQL_INSERT = `
  INSERT INTO DONATIONS (
    ID, TENANT_ID, FUND_ID, AMOUNT_MINOR, CURRENCY, OCCURRED_ON, METHOD,
    DONOR_HOUSEHOLD_ID, DONOR_NAME, ANONYMOUS, RECEIPT_NO, NOTE,
    ADJUSTS_ID, ADJUSTMENT_REASON, CREATED_BY
  ) VALUES (
    :id, :tenantId, :fundId, :amountMinor, :currency, :occurredOn, :method,
    :donorHouseholdId, :donorName, :anonymous, :receiptNo, :note,
    :adjustsId, :adjustmentReason, :createdBy
  )`;

// A donation and its ADJUSTS_ID correction net to the true balance without ever
// mutating a row — the sum already includes negative adjustment amounts.
const SQL_BALANCE_BY_FUND = `
  SELECT FUND_ID, SUM(AMOUNT_MINOR) AS TOTAL_MINOR
    FROM DONATIONS
   WHERE TENANT_ID = :tenantId
   GROUP BY FUND_ID`;

function toRecord(row: Row): DonationRecord {
  return {
    id: row.id,
    fundId: row.fund_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency as Currency,
    occurredOn: row.occurred_on.toISOString().slice(0, 10),
    method: row.method as DonationMethod,
    donorHouseholdId: row.donor_household_id,
    donorName: row.donor_name,
    anonymous: Number(row.anonymous) === 1,
    receiptNo: row.receipt_no,
    note: row.note,
    adjustsId: row.adjusts_id,
    adjustmentReason: row.adjustment_reason,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export class OracleDonationRepository extends BaseRepository implements DonationRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<DonationRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByFund(fundId: string, limit: number): Promise<DonationRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_BY_FUND, { fundId, limit });
    return rows.map(toRecord);
  }

  async listRecent(limit: number): Promise<DonationRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_RECENT, { limit });
    return rows.map(toRecord);
  }

  async create(input: CreateDonationInput): Promise<DonationRecord> {
    await this.scoped(SQL_INSERT, { ...input, occurredOn: new Date(input.occurredOn), anonymous: input.anonymous ? 1 : 0 });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Donation ${input.id} vanished immediately after insert`);
    return created;
  }

  async balanceByFund(): Promise<FundBalance[]> {
    const rows = await this.scoped<{ fund_id: string; total_minor: number }>(SQL_BALANCE_BY_FUND);
    return rows.map((r) => ({ fundId: r.fund_id, totalMinor: Number(r.total_minor) }));
  }
}
