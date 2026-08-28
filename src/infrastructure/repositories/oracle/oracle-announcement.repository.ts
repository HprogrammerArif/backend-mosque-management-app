import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import { BaseRepository } from '../base.repository.js';
import type {
  AnnouncementRepository, AnnouncementRecord, CreateAnnouncementInput,
} from '../../../modules/announcements/ports/announcement.repository.js';

type Row = { id: string; title: string; body: string; urgent: number; created_by: string; created_at: Date };

const COLUMNS = 'ID, TITLE, BODY, URGENT, CREATED_BY, CREATED_AT';

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM ANNOUNCEMENTS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_RECENT = `
  SELECT ${COLUMNS} FROM ANNOUNCEMENTS
   WHERE TENANT_ID = :tenantId
   ORDER BY CREATED_AT DESC
   FETCH FIRST :limit ROWS ONLY`;

const SQL_INSERT = `
  INSERT INTO ANNOUNCEMENTS (ID, TENANT_ID, TITLE, BODY, URGENT, CREATED_BY)
  VALUES (:id, :tenantId, :title, :body, :urgent, :createdBy)`;

function toRecord(row: Row): AnnouncementRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    urgent: Number(row.urgent) === 1,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export class OracleAnnouncementRepository extends BaseRepository implements AnnouncementRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<AnnouncementRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listRecent(limit: number): Promise<AnnouncementRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_RECENT, { limit });
    return rows.map(toRecord);
  }

  async create(input: CreateAnnouncementInput): Promise<AnnouncementRecord> {
    await this.scoped(SQL_INSERT, { ...input, urgent: input.urgent ? 1 : 0 });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Announcement ${input.id} vanished immediately after insert`);
    return created;
  }
}
