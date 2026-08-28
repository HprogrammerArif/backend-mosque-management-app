import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import type { CommitteeStatus } from '../../../domain/enums.js';
import { BaseRepository } from '../base.repository.js';
import type {
  CommitteeMemberRepository, CommitteeMemberRecord, CreateCommitteeMemberInput,
} from '../../../modules/committee/ports/committee-member.repository.js';

type Row = {
  id: string; name: string; position: string | null; phone: string | null;
  term_start: Date | null; term_end: Date | null; status: string;
};

const COLUMNS = 'ID, NAME, POSITION, PHONE, TERM_START, TERM_END, STATUS';

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM COMMITTEE_MEMBERS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_ACTIVE = `
  SELECT ${COLUMNS} FROM COMMITTEE_MEMBERS WHERE TENANT_ID = :tenantId AND STATUS = 'ACTIVE' ORDER BY NAME`;

const SQL_INSERT = `
  INSERT INTO COMMITTEE_MEMBERS (ID, TENANT_ID, NAME, POSITION, PHONE, TERM_START, TERM_END, CREATED_BY)
  VALUES (:id, :tenantId, :name, :position, :phone, :termStart, :termEnd, :createdBy)`;

function toIsoDate(d: Date | null): string | null {
  return d === null ? null : d.toISOString().slice(0, 10);
}

function toRecord(row: Row): CommitteeMemberRecord {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    phone: row.phone,
    termStart: toIsoDate(row.term_start),
    termEnd: toIsoDate(row.term_end),
    status: row.status as CommitteeStatus,
  };
}

export class OracleCommitteeMemberRepository extends BaseRepository implements CommitteeMemberRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<CommitteeMemberRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listActive(): Promise<CommitteeMemberRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_ACTIVE);
    return rows.map(toRecord);
  }

  async create(input: CreateCommitteeMemberInput): Promise<CommitteeMemberRecord> {
    const termStart = input.termStart === null ? null : new Date(input.termStart);
    const termEnd = input.termEnd === null ? null : new Date(input.termEnd);
    await this.scoped(SQL_INSERT, { ...input, termStart, termEnd });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Committee member ${input.id} vanished immediately after insert`);
    return created;
  }
}
