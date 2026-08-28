import type { OraclePool } from '../../database/oracle.pool.js';
import type { PlanRepository, PlanRecord, Entitlements } from '../../../modules/billing/ports/plan.repository.js';

type Row = { code: string; name: string; entitlements: string; active: number };

const COLUMNS = 'CODE, NAME, ENTITLEMENTS, ACTIVE';

const SQL_FIND_BY_CODE = `SELECT ${COLUMNS} FROM PLANS WHERE CODE = :code`;

const SQL_LIST_ACTIVE = `SELECT ${COLUMNS} FROM PLANS WHERE ACTIVE = 1 ORDER BY CODE`;

function toRecord(row: Row): PlanRecord {
  return {
    code: row.code,
    name: row.name,
    entitlements: JSON.parse(row.entitlements) as Entitlements,
    active: Number(row.active) === 1,
  };
}

export class OraclePlanRepository implements PlanRepository {
  constructor(private readonly pool: OraclePool) {}

  async findByCode(code: string): Promise<PlanRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_CODE, { code });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listActive(): Promise<PlanRecord[]> {
    const rows = await this.pool.execute<Row>(SQL_LIST_ACTIVE);
    return rows.map(toRecord);
  }
}
