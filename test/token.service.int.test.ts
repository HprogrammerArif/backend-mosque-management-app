import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { OraclePool } from '../src/infrastructure/database/oracle.pool.js';
import { OracleTokenRepository } from '../src/infrastructure/repositories/oracle/oracle-token.repository.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { loadEnv } from '../src/config/env.js';
import { resetAuthTables } from './helpers/reset-auth-tables.js';

let pool: OraclePool;
let service: TokenService;
const userId = 'u-token-test';
const deviceId = 'd-token-test';

beforeAll(async () => {
  pool = new OraclePool(loadEnv());
  await pool.init();
  service = new TokenService(loadEnv(), new OracleTokenRepository(pool));
});
afterAll(async () => { await pool.close(); });

beforeEach(async () => {
  await resetAuthTables(pool);
  await pool.execute(
    'INSERT INTO USERS (ID, PHONE, PASSWORD_HASH, DISPLAY_NAME) VALUES (:i,:p,:h,:n)',
    { i: userId, p: '+8801700000099', h: 'x', n: 'Token Test' },
  );
  await pool.execute(
    'INSERT INTO DEVICES (ID, USER_ID, PLATFORM) VALUES (:i,:u,:p)',
    { i: deviceId, u: userId, p: 'ANDROID' },
  );
});

describe('TokenService', () => {
  it('issues an access token that verifies', async () => {
    const { accessToken } = await service.issue(userId, deviceId);
    const claims = await service.verifyAccess(accessToken);
    expect(claims.sub).toBe(userId);
    expect(claims.did).toBe(deviceId);
  });

  it('rejects a tampered access token', async () => {
    const { accessToken } = await service.issue(userId, deviceId);
    await expect(service.verifyAccess(accessToken + 'x')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
  });

  it('rotates the refresh token, invalidating the old one', async () => {
    const first = await service.issue(userId, deviceId);
    const second = await service.rotate(first.refreshToken, deviceId);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    const claims = await service.verifyAccess(second.accessToken);
    expect(claims.sub).toBe(userId);
  });

  it('revokes the whole family when a used refresh token is replayed', async () => {
    const first = await service.issue(userId, deviceId);
    const second = await service.rotate(first.refreshToken, deviceId);

    // Replay the already-rotated token.
    await expect(service.rotate(first.refreshToken, deviceId)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_REUSED',
    });

    // The legitimate current token is now dead too — the family was revoked.
    await expect(service.rotate(second.refreshToken, deviceId)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
  });

  it('refuses a refresh token presented from another device', async () => {
    const { refreshToken } = await service.issue(userId, deviceId);
    await expect(service.rotate(refreshToken, 'some-other-device')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
  });

  it('rejects an unknown refresh token', async () => {
    await expect(service.rotate('rt_nonexistent', deviceId)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
    });
  });

  it('never stores the raw refresh token', async () => {
    const { refreshToken } = await service.issue(userId, deviceId);
    const rows = await pool.execute<{ token_hash: string }>(
      'SELECT TOKEN_HASH FROM REFRESH_TOKENS',
    );
    expect(rows[0]?.token_hash).not.toBe(refreshToken);
    expect(rows[0]?.token_hash).toHaveLength(64);   // sha256 hex
  });
});
