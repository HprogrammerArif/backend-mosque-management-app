import type { OraclePool } from '../../database/oracle.pool.js';
import type { TokenRepository, TokenRecord } from '../../../modules/auth/ports/token.repository.js';

type Row = {
  id: string; user_id: string; device_id: string; family_id: string;
  expires_at: Date; revoked_at: Date | null; replaced_by: string | null;
};

const SQL_INSERT = `
  INSERT INTO REFRESH_TOKENS (ID, USER_ID, DEVICE_ID, FAMILY_ID, TOKEN_HASH, EXPIRES_AT)
  VALUES (:id, :userId, :deviceId, :familyId, :tokenHash, :expiresAt)`;

const SQL_FIND = `
  SELECT ID, USER_ID, DEVICE_ID, FAMILY_ID, EXPIRES_AT, REVOKED_AT, REPLACED_BY
    FROM REFRESH_TOKENS WHERE TOKEN_HASH = :tokenHash`;

const SQL_REVOKE = `
  UPDATE REFRESH_TOKENS SET REVOKED_AT = SYSTIMESTAMP, REPLACED_BY = :replacedBy
   WHERE ID = :id AND REVOKED_AT IS NULL`;

const SQL_REVOKE_FAMILY = `
  UPDATE REFRESH_TOKENS SET REVOKED_AT = SYSTIMESTAMP
   WHERE FAMILY_ID = :familyId AND REVOKED_AT IS NULL`;

export class OracleTokenRepository implements TokenRepository {
  constructor(private readonly pool: OraclePool) {}

  async insert(record: TokenRecord & { tokenHash: string }): Promise<void> {
    await this.pool.execute(SQL_INSERT, {
      id: record.id, userId: record.userId, deviceId: record.deviceId,
      familyId: record.familyId, tokenHash: record.tokenHash, expiresAt: record.expiresAt,
    });
  }

  async findByHash(tokenHash: string): Promise<TokenRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND, { tokenHash });
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id, userId: row.user_id, deviceId: row.device_id,
      familyId: row.family_id, expiresAt: row.expires_at, revokedAt: row.revoked_at,
      replacedBy: row.replaced_by,
    };
  }

  async revoke(id: string, replacedBy: string | null): Promise<void> {
    await this.pool.execute(SQL_REVOKE, { id, replacedBy });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.pool.execute(SQL_REVOKE_FAMILY, { familyId });
  }
}
