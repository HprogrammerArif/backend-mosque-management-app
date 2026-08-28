import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { FundType } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type { FundRepository, FundRecord, CreateFundInput } from '../../../modules/mosques/ports/fund.repository.js';

type Row = {
  id: string; tenant_id: string; type: string; name: string; zakat_eligible: number;
};

const COLUMNS = 'ID, TENANT_ID, TYPE, NAME, ZAKAT_ELIGIBLE';

const SQL_LIST = `SELECT ${COLUMNS} FROM FUNDS WHERE TENANT_ID = :tenantId`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM FUNDS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_INSERT = `
  INSERT INTO FUNDS (ID, TENANT_ID, TYPE, NAME, ZAKAT_ELIGIBLE)
  VALUES (:id, :tenantId, :type, :name, :zakatEligible)`;

function toRecord(row: Row): FundRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type as FundType,
    name: row.name,
    zakatEligible: Number(row.zakat_eligible) === 1,
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
    return { ...input, tenantId: this.ctx.tenantId };
  }
}
