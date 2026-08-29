import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { FundType } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type { FundRepository, FundRecord, CreateFundInput } from '../../../modules/mosques/ports/fund.repository.js';

type Row = {
  id: string; tenant_id: string; type: string; name: string; zakat_eligible: number;
  corpus_minor: number | null;
};

const COLUMNS = 'ID, TENANT_ID, TYPE, NAME, ZAKAT_ELIGIBLE, CORPUS_MINOR';

const SQL_LIST = `SELECT ${COLUMNS} FROM FUNDS WHERE TENANT_ID = :tenantId`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM FUNDS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_INSERT = `
  INSERT INTO FUNDS (ID, TENANT_ID, TYPE, NAME, ZAKAT_ELIGIBLE)
  VALUES (:id, :tenantId, :type, :name, :zakatEligible)`;

const SQL_SET_CORPUS = `
  UPDATE FUNDS SET CORPUS_MINOR = :corpusMinor WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LOCK_FOR_UPDATE = `SELECT ${COLUMNS} FROM FUNDS WHERE TENANT_ID = :tenantId AND ID = :id FOR UPDATE`;

/**
 * BR-2's "available" balance: lifetime donations into the fund minus lifetime expenses
 * from it. Same formula as StatisticsRepository.fundBalances — duplicated rather than
 * shared, since that one aggregates across every fund in a single query and this one
 * needs a single fund's figure inline with ExpensesService's existing BR-1 checks.
 */
const SQL_CURRENT_BALANCE = `
  SELECT
    NVL((SELECT SUM(AMOUNT_MINOR) FROM DONATIONS WHERE TENANT_ID = :tenantId AND FUND_ID = :id), 0)
    - NVL((SELECT SUM(AMOUNT_MINOR) FROM EXPENSES WHERE TENANT_ID = :tenantId AND FUND_ID = :id), 0)
    AS BALANCE_MINOR
  FROM DUAL`;

function toRecord(row: Row): FundRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type as FundType,
    name: row.name,
    zakatEligible: Number(row.zakat_eligible) === 1,
    corpusMinor: Number(row.corpus_minor ?? 0),
  };
}

export class OracleFundRepository extends BaseRepository implements FundRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<FundRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listMine(): Promise<FundRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST);
    return rows.map(toRecord);
  }

  /**
   * `tx` runs this inside the provisioning transaction (Task 5), bypassing `scoped()`'s
   * own `executeAsTenant` — that would open a second connection with its own context,
   * breaking the atomicity `withTenantTransaction` exists to provide. Without `tx`, VPD's
   * `update_check` is still the real enforcement: an insert with a mismatched or absent
   * tenant context is rejected by the database itself, not merely by this code path.
   */
  async insert(input: CreateFundInput, tx?: Tx): Promise<FundRecord> {
    const binds = { ...input, zakatEligible: input.zakatEligible ? 1 : 0, tenantId: this.ctx.tenantId };
    if (tx) {
      await tx.execute(SQL_INSERT, binds);
    } else {
      await this.scoped(SQL_INSERT, binds);
    }
    return { ...input, tenantId: this.ctx.tenantId, corpusMinor: 0 };
  }

  async setCorpus(id: string, corpusMinor: number): Promise<FundRecord> {
    await this.scoped(SQL_SET_CORPUS, { id, corpusMinor });
    const updated = await this.findById(id);
    if (!updated) throw new Error(`Fund ${id} vanished immediately after corpus update`);
    return updated;
  }

  async currentBalance(id: string, tx?: Tx): Promise<number> {
    const binds = { id, tenantId: this.ctx.tenantId };
    const rows = tx
      ? await tx.execute<{ balance_minor: number }>(SQL_CURRENT_BALANCE, binds)
      : await this.scoped<{ balance_minor: number }>(SQL_CURRENT_BALANCE, { id });
    return Number(rows[0]?.balance_minor ?? 0);
  }

  async lockForUpdate(id: string, tx: Tx): Promise<FundRecord | null> {
    const rows = await tx.execute<Row>(SQL_LOCK_FOR_UPDATE, { id, tenantId: this.ctx.tenantId });
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
