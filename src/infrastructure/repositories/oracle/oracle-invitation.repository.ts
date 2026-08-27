import type { OraclePool } from '../../database/oracle.pool.js';
import type { Role } from '../../../domain/enums.js';
import type {
  InvitationRepository, InvitationRecord, CreateInvitationInput,
} from '../../../modules/mosques/ports/invitation.repository.js';

type Row = {
  id: string; mosque_id: string; email_or_phone: string; role: string;
  token_hash: string; invited_by: string; expires_at: Date; accepted_at: Date | null;
};

const COLUMNS = 'ID, MOSQUE_ID, EMAIL_OR_PHONE, ROLE, TOKEN_HASH, INVITED_BY, EXPIRES_AT, ACCEPTED_AT';

const SQL_FIND_BY_HASH = `SELECT ${COLUMNS} FROM INVITATIONS WHERE TOKEN_HASH = :tokenHash`;

const SQL_INSERT = `
  INSERT INTO INVITATIONS (ID, MOSQUE_ID, EMAIL_OR_PHONE, ROLE, TOKEN_HASH, INVITED_BY, EXPIRES_AT)
  VALUES (:id, :mosqueId, :emailOrPhone, :role, :tokenHash, :invitedBy, :expiresAt)`;

const SQL_MARK_ACCEPTED = `UPDATE INVITATIONS SET ACCEPTED_AT = SYSTIMESTAMP WHERE ID = :id`;

function toRecord(row: Row): InvitationRecord {
  return {
    id: row.id,
    mosqueId: row.mosque_id,
    emailOrPhone: row.email_or_phone,
    role: row.role as Role,
    tokenHash: row.token_hash,
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  };
}

export class OracleInvitationRepository implements InvitationRepository {
  constructor(private readonly pool: OraclePool) {}

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_HASH, { tokenHash });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async create(input: CreateInvitationInput): Promise<InvitationRecord> {
    await this.pool.execute(SQL_INSERT, { ...input });
    return { ...input, acceptedAt: null };
  }

  async markAccepted(id: string): Promise<void> {
    await this.pool.execute(SQL_MARK_ACCEPTED, { id });
  }
}
