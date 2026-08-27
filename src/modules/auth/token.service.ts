import { randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { uuidv7 } from 'uuidv7';
import { AppError } from '../../common/errors/app-error.js';
import type { Env } from '../../config/env.js';
import type { TokenRepository } from './ports/token.repository.js';

export type IssuedTokens = { accessToken: string; expiresIn: number; refreshToken: string };
export type AccessClaims = { sub: string; jti: string; did: string };

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export class TokenService {
  readonly #secret: Uint8Array;

  constructor(
    private readonly env: Env,
    private readonly tokens: TokenRepository,
  ) {
    this.#secret = new TextEncoder().encode(env.JWT_SECRET);
  }

  async #signAccess(userId: string, deviceId: string): Promise<string> {
    return new SignJWT({ did: deviceId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(uuidv7())
      .setIssuedAt()
      .setExpirationTime(`${this.env.JWT_ACCESS_TTL}s`)
      .sign(this.#secret);
  }

  async #mint(
    userId: string, deviceId: string, familyId: string,
  ): Promise<{ tokens: IssuedTokens; rowId: string }> {
    const id = uuidv7();
    const refreshToken = `rt_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000);

    await this.tokens.insert({
      id, userId, deviceId, familyId,
      tokenHash: sha256(refreshToken), expiresAt, revokedAt: null, replacedBy: null,
    });

    return {
      tokens: {
        accessToken: await this.#signAccess(userId, deviceId),
        expiresIn: this.env.JWT_ACCESS_TTL,
        refreshToken,
      },
      rowId: id,
    };
  }

  /** First issue for a device — starts a new rotation family. */
  async issue(userId: string, deviceId: string): Promise<IssuedTokens> {
    const { tokens } = await this.#mint(userId, deviceId, uuidv7());
    return tokens;
  }

  async rotate(refreshToken: string, deviceId: string): Promise<IssuedTokens> {
    const record = await this.tokens.findByHash(sha256(refreshToken));

    if (!record) {
      throw new AppError('AUTH_TOKEN_INVALID', 'Refresh token not recognised');
    }
    if (record.revokedAt !== null) {
      if (record.replacedBy !== null) {
        // This exact token was individually rotated away and is now being
        // presented again — the classic replay/theft signal. Kill the family.
        await this.tokens.revokeFamily(record.familyId);
        throw new AppError('AUTH_TOKEN_REUSED', 'Refresh token replayed; all sessions revoked');
      }
      // Already terminated by a family-wide revocation triggered by a sibling
      // token's replay. This device did nothing wrong; its session just ended.
      throw new AppError('AUTH_TOKEN_INVALID', 'Session has been revoked');
    }
    if (record.deviceId !== deviceId) {
      throw new AppError('AUTH_TOKEN_INVALID', 'Refresh token is bound to another device');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new AppError('AUTH_TOKEN_EXPIRED', 'Refresh token has expired');
    }

    const { tokens: next, rowId } = await this.#mint(record.userId, deviceId, record.familyId);
    await this.tokens.revoke(record.id, rowId);
    return next;
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.#secret);
      return {
        sub: payload.sub as string,
        jti: payload.jti as string,
        did: payload['did'] as string,
      };
    } catch {
      throw new AppError('AUTH_TOKEN_INVALID', 'Access token is invalid or expired');
    }
  }

  /** Revokes every family belonging to a device by revoking the token presented with logout. */
  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const record = await this.tokens.findByHash(sha256(refreshToken));
    if (record) await this.tokens.revokeFamily(record.familyId);
  }
}
