import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { HouseholdStatus } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type {
  HouseholdRepository, HouseholdRecord, CreateHouseholdInput,
} from '../../../modules/households/ports/household.repository.js';

type Row = {
  id: string; name: string; head_individual_id: string | null;
  address_line1: string | null; area: string | null; phone: string | null;
  monthly_dues_minor: number; collector_user_id: string | null;
  exempt: number; joined_on: Date | null; status: string;
};

const COLUMNS = `ID, NAME, HEAD_INDIVIDUAL_ID, ADDRESS_LINE1, AREA, PHONE,
  MONTHLY_DUES_MINOR, COLLECTOR_USER_ID, EXEMPT, JOINED_ON, STATUS`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM HOUSEHOLDS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_ACTIVE = `
  SELECT ${COLUMNS} FROM HOUSEHOLDS
   WHERE TENANT_ID = :tenantId AND STATUS = 'ACTIVE'
   ORDER BY NAME`;

const SQL_INSERT = `
  INSERT INTO HOUSEHOLDS (
    ID, TENANT_ID, NAME, ADDRESS_LINE1, AREA, PHONE,
    MONTHLY_DUES_MINOR, COLLECTOR_USER_ID, EXEMPT, JOINED_ON, CREATED_BY
  ) VALUES (
    :id, :tenantId, :name, :addressLine1, :area, :phone,
    :monthlyDuesMinor, :collectorUserId, :exempt, :joinedOn, :createdBy
  )`;

function toIsoDate(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10);
}

function toRecord(row: Row): HouseholdRecord {
  return {
    id: row.id,
    name: row.name,
    headIndividualId: row.head_individual_id,
    addressLine1: row.address_line1,
    area: row.area,
    phone: row.phone,
    monthlyDuesMinor: Number(row.monthly_dues_minor),
    collectorUserId: row.collector_user_id,
    exempt: Number(row.exempt) === 1,
    joinedOn: toIsoDate(row.joined_on),
    status: row.status as HouseholdStatus,
  };
}

export class OracleHouseholdRepository extends BaseRepository implements HouseholdRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<HouseholdRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listActive(): Promise<HouseholdRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_ACTIVE);
    return rows.map(toRecord);
  }

  async create(input: CreateHouseholdInput): Promise<HouseholdRecord> {
    const joinedOn = input.joinedOn === null ? null : new Date(input.joinedOn);
    await this.scoped(SQL_INSERT, {
      ...input,
      exempt: input.exempt ? 1 : 0,
      joinedOn,
    });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Household ${input.id} vanished immediately after insert`);
    return created;
  }
}
