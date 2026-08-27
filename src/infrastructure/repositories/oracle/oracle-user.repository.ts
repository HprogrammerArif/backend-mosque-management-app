import type { OraclePool } from '../../database/oracle.pool.js';
import type {
  UserRepository, UserRecord, CreateUserInput, UserStatus,
} from '../../../modules/auth/ports/user.repository.js';

type Row = {
  id: string; phone: string | null; email: string | null;
  password_hash: string; display_name: string; locale: string;
  status: string; failed_attempts: number; locked_until: Date | null;
};

const COLUMNS = `ID, PHONE, EMAIL, PASSWORD_HASH, DISPLAY_NAME, LOCALE,
                 STATUS, FAILED_ATTEMPTS, LOCKED_UNTIL`;

const SQL_FIND_BY_ID = `SELECT ${COLUMNS} FROM USERS WHERE ID = :id`;

const SQL_FIND_BY_IDENTIFIER = `
  SELECT ${COLUMNS} FROM USERS
   WHERE PHONE = :identifier OR LOWER(EMAIL) = LOWER(:identifier)`;

const SQL_INSERT = `
  INSERT INTO USERS (ID, PHONE, EMAIL, PASSWORD_HASH, DISPLAY_NAME, LOCALE)
  VALUES (:id, :phone, :email, :passwordHash, :displayName, :locale)`;

/** Locks for 15 minutes once attempts reach 5. */
const SQL_FAIL = `
  UPDATE USERS
     SET FAILED_ATTEMPTS = FAILED_ATTEMPTS + 1,
         LOCKED_UNTIL = CASE WHEN FAILED_ATTEMPTS + 1 >= 5
                             THEN SYSTIMESTAMP + INTERVAL '15' MINUTE
                             ELSE LOCKED_UNTIL END,
         UPDATED_AT = SYSTIMESTAMP
   WHERE ID = :id`;

const SQL_CLEAR = `
  UPDATE USERS SET FAILED_ATTEMPTS = 0, LOCKED_UNTIL = NULL, UPDATED_AT = SYSTIMESTAMP
   WHERE ID = :id`;

function toRecord(row: Row): UserRecord {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    locale: row.locale,
    status: row.status as UserStatus,
    failedAttempts: Number(row.failed_attempts),
    lockedUntil: row.locked_until,
  };
}

export class OracleUserRepository implements UserRepository {
  constructor(private readonly pool: OraclePool) {}

  async findById(id: string): Promise<UserRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_ID, { id });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_IDENTIFIER, { identifier });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    await this.pool.execute(SQL_INSERT, { ...input });
    const created = await this.findById(input.id);
    if (!created) throw new Error(`User ${input.id} vanished immediately after insert`);
    return created;
  }

  async recordFailedAttempt(id: string): Promise<void> {
    await this.pool.execute(SQL_FAIL, { id });
  }

  async clearFailedAttempts(id: string): Promise<void> {
    await this.pool.execute(SQL_CLEAR, { id });
  }
}
