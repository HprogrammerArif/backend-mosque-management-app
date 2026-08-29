import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type { Role } from '../../../domain/enums.js';
import type {
  MembershipRepository, MembershipRecord, CreateMembershipInput, MembershipStatus,
} from '../../../modules/mosques/ports/membership.repository.js';

type Row = {
  id: string; mosque_id: string; user_id: string; role: string; status: string;
};

const COLUMNS = 'ID, MOSQUE_ID, USER_ID, ROLE, STATUS';

const SQL_FIND_ACTIVE = `
  SELECT ${COLUMNS} FROM MEMBERSHIPS
   WHERE MOSQUE_ID = :mosqueId AND USER_ID = :userId AND STATUS = 'ACTIVE'`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM MEMBERSHIPS WHERE ID = :id`;

const SQL_LIST_BY_MOSQUE = `SELECT ${COLUMNS} FROM MEMBERSHIPS WHERE MOSQUE_ID = :mosqueId`;

const SQL_COUNT_ACTIVE_ADMINS = `
  SELECT COUNT(*) AS CNT FROM MEMBERSHIPS
   WHERE MOSQUE_ID = :mosqueId AND ROLE = 'ADMIN' AND STATUS = 'ACTIVE'`;

// No aggregate/FOR UPDATE combination — Oracle rejects FOR UPDATE on a COUNT(*) query —
// so this locks the individual rows and the caller counts what came back.
const SQL_LOCK_ACTIVE_ADMINS = `
  SELECT ID FROM MEMBERSHIPS
   WHERE MOSQUE_ID = :mosqueId AND ROLE = 'ADMIN' AND STATUS = 'ACTIVE'
   FOR UPDATE`;

const SQL_INSERT = `
  INSERT INTO MEMBERSHIPS (ID, MOSQUE_ID, USER_ID, ROLE)
  VALUES (:id, :mosqueId, :userId, :role)`;

const SQL_UPDATE_ROLE = `UPDATE MEMBERSHIPS SET ROLE = :role WHERE ID = :id`;

const SQL_UPDATE_STATUS = `UPDATE MEMBERSHIPS SET STATUS = :status WHERE ID = :id`;

function toRecord(row: Row): MembershipRecord {
  return {
    id: row.id,
    mosqueId: row.mosque_id,
    userId: row.user_id,
    role: row.role as Role,
    status: row.status as MembershipStatus,
  };
}

export class OracleMembershipRepository implements MembershipRepository {
  constructor(private readonly pool: OraclePool) {}

  async findActive(mosqueId: string, userId: string): Promise<MembershipRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_ACTIVE, { mosqueId, userId });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<MembershipRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByMosque(mosqueId: string): Promise<MembershipRecord[]> {
    const rows = await this.pool.execute<Row>(SQL_LIST_BY_MOSQUE, { mosqueId });
    return rows.map(toRecord);
  }

  async countActiveAdmins(mosqueId: string): Promise<number> {
    const rows = await this.pool.execute<{ cnt: number }>(SQL_COUNT_ACTIVE_ADMINS, { mosqueId });
    return Number(rows[0]?.cnt ?? 0);
  }

  async lockActiveAdmins(mosqueId: string, tx: Tx): Promise<string[]> {
    const rows = await tx.execute<{ id: string }>(SQL_LOCK_ACTIVE_ADMINS, { mosqueId });
    return rows.map((r) => r.id);
  }

  /** See OracleMosqueRepository.create's note on the optional `tx` parameter. */
  async create(input: CreateMembershipInput, tx?: Tx): Promise<MembershipRecord> {
    const exec = tx ?? this.pool;
    await exec.execute(SQL_INSERT, { ...input });
    return { ...input, status: 'ACTIVE' };
  }

  async updateRole(id: string, role: Role, tx?: Tx): Promise<void> {
    const exec = tx ?? this.pool;
    await exec.execute(SQL_UPDATE_ROLE, { id, role });
  }

  async updateStatus(id: string, status: MembershipStatus, tx?: Tx): Promise<void> {
    const exec = tx ?? this.pool;
    await exec.execute(SQL_UPDATE_STATUS, { id, status });
  }
}
