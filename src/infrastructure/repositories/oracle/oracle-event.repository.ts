import type { OraclePool } from '../../database/oracle.pool.js';
import type { TenantContext } from '../../../modules/tenancy/tenant-context.js';
import { BaseRepository } from '../base.repository.js';
import type { EventRepository, EventRecord, CreateEventInput } from '../../../modules/events/ports/event.repository.js';

type Row = {
  id: string; title: string; description: string | null;
  starts_at: Date; ends_at: Date | null; location: string | null;
  created_by: string; created_at: Date;
};

const COLUMNS = 'ID, TITLE, DESCRIPTION, STARTS_AT, ENDS_AT, LOCATION, CREATED_BY, CREATED_AT';

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM EVENTS WHERE TENANT_ID = :tenantId AND ID = :id`;

const SQL_LIST_UPCOMING = `
  SELECT ${COLUMNS} FROM EVENTS
   WHERE TENANT_ID = :tenantId AND STARTS_AT >= SYSTIMESTAMP
   ORDER BY STARTS_AT ASC
   FETCH FIRST :limit ROWS ONLY`;

const SQL_INSERT = `
  INSERT INTO EVENTS (ID, TENANT_ID, TITLE, DESCRIPTION, STARTS_AT, ENDS_AT, LOCATION, CREATED_BY)
  VALUES (:id, :tenantId, :title, :description, :startsAt, :endsAt, :location, :createdBy)`;

function toRecord(row: Row): EventRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at === null ? null : row.ends_at.toISOString(),
    location: row.location,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export class OracleEventRepository extends BaseRepository implements EventRepository {
  constructor(pool: OraclePool, ctx: TenantContext) {
    super(pool, ctx);
  }

  async findById(id: string): Promise<EventRecord | null> {
    const rows = await this.scoped<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listUpcoming(limit: number): Promise<EventRecord[]> {
    const rows = await this.scoped<Row>(SQL_LIST_UPCOMING, { limit });
    return rows.map(toRecord);
  }

  async create(input: CreateEventInput): Promise<EventRecord> {
    await this.scoped(SQL_INSERT, {
      ...input,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt === null ? null : new Date(input.endsAt),
    });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`Event ${input.id} vanished immediately after insert`);
    return created;
  }
}
