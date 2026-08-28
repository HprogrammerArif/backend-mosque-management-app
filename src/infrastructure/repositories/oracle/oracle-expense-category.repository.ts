import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import { BaseRepository } from '../base.repository.js';
import type {
  ExpenseCategoryRepository, ExpenseCategoryRecord, CreateExpenseCategoryInput, AsnafCategory,
} from '../../../modules/donations/ports/expense-category.repository.js';

type Row = {
  id: string; name: string; zakat_eligible: number;
  asnaf_category: string | null; is_system: number;
};

const COLUMNS = 'ID, NAME, ZAKAT_ELIGIBLE, ASNAF_CATEGORY, IS_SYSTEM';

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM EXPENSE_CATEGORIES WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_ALL = `SELECT ${COLUMNS} FROM EXPENSE_CATEGORIES WHERE TENANT_ID = :tenantId ORDER BY NAME`;

const SQL_INSERT = `
  INSERT INTO EXPENSE_CATEGORIES (ID, TENANT_ID, NAME, ZAKAT_ELIGIBLE, ASNAF_CATEGORY, IS_SYSTEM, CREATED_BY)
  VALUES (:id, :tenantId, :name, :zakatEligible, :asnafCategory, :isSystem, :createdBy)`;

function toRecord(row: Row): ExpenseCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    zakatEligible: Number(row.zakat_eligible) === 1,
    asnafCategory: row.asnaf_category as AsnafCategory | null,
    isSystem: Number(row.is_system) === 1,
  };
}

export class OracleExpenseCategoryRepository extends BaseRepository implements ExpenseCategoryRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<ExpenseCategoryRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listAll(): Promise<ExpenseCategoryRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_ALL);
    return rows.map(toRecord);
  }

  /** `tx` lets provisioning seed default categories atomically — see OracleFundRepository.insert. */
  async insert(input: CreateExpenseCategoryInput, tx?: Tx): Promise<ExpenseCategoryRecord> {
    const binds = {
      ...input,
      zakatEligible: input.zakatEligible ? 1 : 0,
      isSystem: input.isSystem ? 1 : 0,
      tenantId: this.ctx.tenantId,
      createdBy: this.ctx.userId,
    };
    if (tx) {
      await tx.execute(SQL_INSERT, binds);
    } else {
      await this.scoped(SQL_INSERT, binds);
    }
    return { ...input };
  }
}
