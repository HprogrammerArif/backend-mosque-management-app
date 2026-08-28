import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { PayrollRunStatus } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type {
  PayrollRunRepository, PayrollRunRecord, CreatePayrollRunInput,
  PayrollLineRecord, CreatePayrollLineInput,
} from '../../../modules/payroll/ports/payroll-run.repository.js';

type RunRow = {
  id: string; period: string; fund_id: string; status: string;
  posted_at: Date | null; created_by: string; created_at: Date;
};
type LineRow = {
  id: string; run_id: string; staff_id: string; amount_minor: number;
  currency: string; expense_id: string | null;
};

const RUN_COLUMNS = 'ID, PERIOD, FUND_ID, STATUS, POSTED_AT, CREATED_BY, CREATED_AT';
const LINE_COLUMNS = 'ID, RUN_ID, STAFF_ID, AMOUNT_MINOR, CURRENCY, EXPENSE_ID';

const SQL_FIND_RUN_BY_ID = `SELECT ${RUN_COLUMNS} FROM PAYROLL_RUNS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_FIND_RUN_BY_PERIOD = `
  SELECT ${RUN_COLUMNS} FROM PAYROLL_RUNS WHERE TENANT_ID = :tenantId AND PERIOD = :period`;

const SQL_INSERT_RUN = `
  INSERT INTO PAYROLL_RUNS (ID, TENANT_ID, PERIOD, FUND_ID, CREATED_BY)
  VALUES (:id, :tenantId, :period, :fundId, :createdBy)`;

const SQL_MARK_POSTED = `
  UPDATE PAYROLL_RUNS SET STATUS = 'POSTED', POSTED_AT = SYSTIMESTAMP
   WHERE ID = :id AND TENANT_ID = :tenantId`;

const SQL_INSERT_LINE = `
  INSERT INTO PAYROLL_LINES (ID, TENANT_ID, RUN_ID, STAFF_ID, AMOUNT_MINOR, CURRENCY)
  VALUES (:id, :tenantId, :runId, :staffId, :amountMinor, :currency)`;

const SQL_LIST_LINES = `
  SELECT ${LINE_COLUMNS} FROM PAYROLL_LINES WHERE TENANT_ID = :tenantId AND RUN_ID = :runId`;

const SQL_SET_LINE_EXPENSE = `
  UPDATE PAYROLL_LINES SET EXPENSE_ID = :expenseId WHERE ID = :id AND TENANT_ID = :tenantId`;

function toRunRecord(row: RunRow): PayrollRunRecord {
  return {
    id: row.id,
    period: row.period,
    fundId: row.fund_id,
    status: row.status as PayrollRunStatus,
    postedAt: row.posted_at === null ? null : row.posted_at.toISOString(),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

function toLineRecord(row: LineRow): PayrollLineRecord {
  return {
    id: row.id,
    runId: row.run_id,
    staffId: row.staff_id,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    expenseId: row.expense_id,
  };
}

export class OraclePayrollRunRepository extends BaseRepository implements PayrollRunRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<PayrollRunRecord | null> {
    const rows = await this.scoped<RunRow>(SQL_FIND_RUN_BY_ID, { id });
    return rows[0] ? toRunRecord(rows[0]) : null;
  }

  async findByPeriod(period: string): Promise<PayrollRunRecord | null> {
    const rows = await this.scoped<RunRow>(SQL_FIND_RUN_BY_PERIOD, { period });
    return rows[0] ? toRunRecord(rows[0]) : null;
  }

  async create(input: CreatePayrollRunInput): Promise<PayrollRunRecord> {
    await this.scoped(SQL_INSERT_RUN, input);
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Payroll run ${input.id} vanished immediately after insert`);
    return created;
  }

  /** `tx` runs this inside PayrollService.postRun's transaction alongside the EXPENSE writes. */
  async markPosted(id: string, tx?: Tx): Promise<void> {
    const binds = { id, tenantId: this.ctx.tenantId };
    if (tx) {
      await tx.execute(SQL_MARK_POSTED, binds);
    } else {
      await this.scoped(SQL_MARK_POSTED, binds);
    }
  }

  async createLine(input: CreatePayrollLineInput, tx?: Tx): Promise<PayrollLineRecord> {
    const binds = { ...input, tenantId: this.ctx.tenantId };
    if (tx) {
      await tx.execute(SQL_INSERT_LINE, binds);
    } else {
      await this.scoped(SQL_INSERT_LINE, binds);
    }
    return { ...input, expenseId: null };
  }

  async listLines(runId: string): Promise<PayrollLineRecord[]> {
    const rows = await this.scoped<LineRow>(SQL_LIST_LINES, { runId });
    return rows.map(toLineRecord);
  }

  async setLineExpense(lineId: string, expenseId: string, tx?: Tx): Promise<void> {
    const binds = { id: lineId, expenseId, tenantId: this.ctx.tenantId };
    if (tx) {
      await tx.execute(SQL_SET_LINE_EXPENSE, binds);
    } else {
      await this.scoped(SQL_SET_LINE_EXPENSE, binds);
    }
  }
}
