import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { Relation } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type {
  IndividualRepository, IndividualRecord, CreateIndividualInput,
} from '../../../modules/households/ports/individual.repository.js';

type Row = {
  id: string; household_id: string; user_id: string | null; full_name: string;
  relation: string; phone: string | null; date_of_birth: Date | null; gender: string | null;
};

const COLUMNS = 'ID, HOUSEHOLD_ID, USER_ID, FULL_NAME, RELATION, PHONE, DATE_OF_BIRTH, GENDER';

const SQL_LIST_BY_HOUSEHOLD = `
  SELECT ${COLUMNS} FROM INDIVIDUALS
   WHERE TENANT_ID = :tenantId AND HOUSEHOLD_ID = :householdId
   ORDER BY FULL_NAME`;

const SQL_INSERT = `
  INSERT INTO INDIVIDUALS (
    ID, TENANT_ID, HOUSEHOLD_ID, USER_ID, FULL_NAME, RELATION, PHONE, DATE_OF_BIRTH, GENDER, CREATED_BY
  ) VALUES (
    :id, :tenantId, :householdId, :userId, :fullName, :relation, :phone, :dateOfBirth, :gender, :createdBy
  )`;

function toRecord(row: Row): IndividualRecord {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    fullName: row.full_name,
    relation: row.relation as Relation,
    phone: row.phone,
    dateOfBirth: row.date_of_birth === null ? null : row.date_of_birth.toISOString().slice(0, 10),
    gender: row.gender,
  };
}

export class OracleIndividualRepository extends BaseRepository implements IndividualRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async listByHousehold(householdId: string): Promise<IndividualRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_BY_HOUSEHOLD, { householdId });
    return rows.map(toRecord);
  }

  async create(input: CreateIndividualInput): Promise<IndividualRecord> {
    const dateOfBirth = input.dateOfBirth === null ? null : new Date(input.dateOfBirth);
    await this.scoped(SQL_INSERT, { ...input, dateOfBirth });
    const rows = await this.listByHousehold(input.householdId);
    const created = rows.find((r) => r.id === input.id);
    if (!created) throw new Error(`Individual ${input.id} vanished immediately after insert`);
    return created;
  }
}
