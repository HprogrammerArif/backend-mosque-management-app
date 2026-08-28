import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { StaffStatus } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type { StaffRepository, StaffRecord, CreateStaffInput } from '../../../modules/payroll/ports/staff.repository.js';

type Row = {
  id: string; name: string; role_title: string | null; phone: string | null;
  monthly_salary_minor: number; currency: string; status: string; joined_on: Date | null;
};

const COLUMNS = `ID, NAME, ROLE_TITLE, PHONE, MONTHLY_SALARY_MINOR, CURRENCY, STATUS, JOINED_ON`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM STAFF WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_ACTIVE = `
  SELECT ${COLUMNS} FROM STAFF WHERE TENANT_ID = :tenantId AND STATUS = 'ACTIVE' ORDER BY NAME`;

const SQL_INSERT = `
  INSERT INTO STAFF (ID, TENANT_ID, NAME, ROLE_TITLE, PHONE, MONTHLY_SALARY_MINOR, CURRENCY, JOINED_ON, CREATED_BY)
  VALUES (:id, :tenantId, :name, :roleTitle, :phone, :monthlySalaryMinor, :currency, :joinedOn, :createdBy)`;

function toIsoDate(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10);
}

function toRecord(row: Row): StaffRecord {
  return {
    id: row.id,
    name: row.name,
    roleTitle: row.role_title,
    phone: row.phone,
    monthlySalaryMinor: Number(row.monthly_salary_minor),
    currency: row.currency,
    status: row.status as StaffStatus,
    joinedOn: toIsoDate(row.joined_on),
  };
}

export class OracleStaffRepository extends BaseRepository implements StaffRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<StaffRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listActive(): Promise<StaffRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_ACTIVE);
    return rows.map(toRecord);
  }

  async create(input: CreateStaffInput): Promise<StaffRecord> {
    const joinedOn = input.joinedOn === null ? null : new Date(input.joinedOn);
    await this.scoped(SQL_INSERT, { ...input, joinedOn });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Staff ${input.id} vanished immediately after insert`);
    return created;
  }
}
