import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { DonationMethod } from '../../../domain/enums.js';
import type { Currency } from '../../../domain/money.js';
import { BaseRepository } from '../base.repository.js';
import type {
  ExpenseRepository, ExpenseRecord, CreateExpenseInput, ApprovalStatus,
} from '../../../modules/donations/ports/expense.repository.js';

type Row = {
  id: string; fund_id: string; category_id: string; amount_minor: number; currency: string;
  occurred_on: Date; payee: string | null; description: string | null; method: string;
  approval_status: string; adjusts_id: string | null; adjustment_reason: string | null;
  created_by: string; created_at: Date;
};

const COLUMNS = `ID, FUND_ID, CATEGORY_ID, AMOUNT_MINOR, CURRENCY, OCCURRED_ON,
  PAYEE, DESCRIPTION, METHOD, APPROVAL_STATUS, ADJUSTS_ID, ADJUSTMENT_REASON, CREATED_BY, CREATED_AT`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM EXPENSES WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_RECENT = `
  SELECT ${COLUMNS} FROM EXPENSES
   WHERE TENANT_ID = :tenantId
   ORDER BY OCCURRED_ON DESC, CREATED_AT DESC
   FETCH FIRST :limit ROWS ONLY`;

const SQL_INSERT = `
  INSERT INTO EXPENSES (
    ID, TENANT_ID, FUND_ID, CATEGORY_ID, AMOUNT_MINOR, CURRENCY, OCCURRED_ON,
    PAYEE, DESCRIPTION, METHOD, ADJUSTS_ID, ADJUSTMENT_REASON, CREATED_BY
  ) VALUES (
    :id, :tenantId, :fundId, :categoryId, :amountMinor, :currency, :occurredOn,
    :payee, :description, :method, :adjustsId, :adjustmentReason, :createdBy
  )`;

function toRecord(row: Row): ExpenseRecord {
  return {
    id: row.id,
    fundId: row.fund_id,
    categoryId: row.category_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency as Currency,
    occurredOn: row.occurred_on.toISOString().slice(0, 10),
    payee: row.payee,
    description: row.description,
    method: row.method as DonationMethod,
    approvalStatus: row.approval_status as ApprovalStatus,
    adjustsId: row.adjusts_id,
    adjustmentReason: row.adjustment_reason,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export class OracleExpenseRepository extends BaseRepository implements ExpenseRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<ExpenseRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listRecent(limit: number): Promise<ExpenseRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_RECENT, { limit });
    return rows.map(toRecord);
  }

  async create(input: CreateExpenseInput): Promise<ExpenseRecord> {
    await this.scoped(SQL_INSERT, { ...input, occurredOn: new Date(input.occurredOn) });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Expense ${input.id} vanished immediately after insert`);
    return created;
  }
}
