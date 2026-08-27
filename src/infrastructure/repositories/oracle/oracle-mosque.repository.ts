import type { OraclePool, Tx } from '../../database/oracle.pool.js';
import type {
  MosqueRepository, MosqueRecord, CreateMosqueInput, MosqueStatus,
} from '../../../modules/mosques/ports/mosque.repository.js';

type Row = {
  id: string; name: string; timezone: string;
  latitude: number; longitude: number; status: string;
};

const COLUMNS = 'ID, NAME, TIMEZONE, LATITUDE, LONGITUDE, STATUS';

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM MOSQUES WHERE ID = :id`;

const SQL_LIST_BY_USER = `
  SELECT m.${COLUMNS.replaceAll(', ', ', m.')}
    FROM MOSQUES m
    JOIN MEMBERSHIPS ms ON ms.MOSQUE_ID = m.ID
   WHERE ms.USER_ID = :userId AND ms.STATUS = 'ACTIVE'`;

const SQL_INSERT = `
  INSERT INTO MOSQUES (ID, NAME, TIMEZONE, LATITUDE, LONGITUDE, STATUS)
  VALUES (:id, :name, :timezone, :latitude, :longitude, :status)`;

function toRecord(row: Row): MosqueRecord {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    status: row.status as MosqueStatus,
  };
}

export class OracleMosqueRepository implements MosqueRepository {
  constructor(private readonly pool: OraclePool) {}

  async findById(id: string): Promise<MosqueRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listByUser(userId: string): Promise<MosqueRecord[]> {
    const rows = await this.pool.execute<Row>(SQL_LIST_BY_USER, { userId });
    return rows.map(toRecord);
  }

  /**
   * `tx` lets this run inside the provisioning transaction (mosque + admin membership +
   * seeded funds, one atomic unit — Task 5) as well as standalone. Both `OraclePool` and
   * `Tx` satisfy the same `execute<T>(sql, binds?)` shape structurally, so no adapter
   * type is needed — `this.pool` itself is a valid `Tx` when none is supplied.
   */
  async create(input: CreateMosqueInput, tx?: Tx): Promise<MosqueRecord> {
    const exec = tx ?? this.pool;
    await exec.execute(SQL_INSERT, { ...input });
    return { ...input };
  }
}
