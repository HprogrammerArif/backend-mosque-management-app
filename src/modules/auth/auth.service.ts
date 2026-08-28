import { uuidv7 } from 'uuidv7';
import type { AuthResponse, LoginInput, RegisterInput } from './auth.schemas.js';
import { AppError } from '../../common/errors/app-error.js';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import type { PasswordService } from './password.service.js';
import type { TokenService } from './token.service.js';
import type { UserRepository, UserRecord } from './ports/user.repository.js';

const SQL_MEMBERSHIPS_WITH_PLAN = `
  SELECT m.ID AS MOSQUE_ID, m.NAME AS MOSQUE_NAME, ms.ROLE,
         s.PLAN_CODE, p.ENTITLEMENTS
    FROM MOSQUES m
    JOIN MEMBERSHIPS ms ON ms.MOSQUE_ID = m.ID
    LEFT JOIN SUBSCRIPTIONS s ON s.MOSQUE_ID = m.ID AND s.STATUS IN ('TRIALING','ACTIVE')
    LEFT JOIN PLANS p ON p.CODE = s.PLAN_CODE
   WHERE ms.USER_ID = :userId AND ms.STATUS = 'ACTIVE'`;

const NO_ENTITLEMENTS = { features: [] as string[], limits: { adminUsers: null, members: null, historyMonths: null } };

const SQL_UPSERT_DEVICE = `
  MERGE INTO DEVICES d
  USING (SELECT :id AS ID FROM DUAL) s ON (d.ID = s.ID)
  WHEN MATCHED THEN UPDATE SET
    MODEL = :model, APP_VERSION = :appVersion,
    PUSH_TOKEN = :pushToken, LAST_SEEN_AT = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (ID, USER_ID, PLATFORM, MODEL, APP_VERSION, PUSH_TOKEN, LAST_SEEN_AT)
    VALUES (:id, :userId, :platform, :model, :appVersion, :pushToken, SYSTIMESTAMP)`;
// Portability note: PostgreSQL equivalent is INSERT ... ON CONFLICT (id) DO UPDATE.

/** A fixed valid argon2id hash, used to equalise timing on the unknown-user path. */
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly pool: OraclePool,
  ) {}

  #present(user: UserRecord, issued: Omit<AuthResponse, 'user'>): AuthResponse {
    return {
      ...issued,
      user: {
        id: user.id, displayName: user.displayName, locale: user.locale,
        phone: user.phone, email: user.email,
      },
    };
  }

  /** Entitlements at login/register, per FR-SUB-9 — see auth.schemas.ts's authResponseSchema. */
  async #loadMemberships(userId: string): Promise<AuthResponse['memberships']> {
    const rows = await this.pool.execute<{
      mosque_id: string; mosque_name: string; role: string;
      plan_code: string | null; entitlements: string | null;
    }>(SQL_MEMBERSHIPS_WITH_PLAN, { userId });

    return rows.map((row) => ({
      mosqueId: row.mosque_id,
      mosqueName: row.mosque_name,
      role: row.role,
      plan: row.plan_code,
      entitlements: row.entitlements === null
        ? NO_ENTITLEMENTS
        : JSON.parse(row.entitlements) as AuthResponse['memberships'][number]['entitlements'],
    }));
  }

  async register(input: RegisterInput): Promise<AuthResponse> {
    if (input.phone && await this.users.findByIdentifier(input.phone)) {
      throw new AppError('AUTH_PHONE_TAKEN', 'That phone number is already registered');
    }
    if (input.email && await this.users.findByIdentifier(input.email)) {
      throw new AppError('AUTH_EMAIL_TAKEN', 'That email address is already registered');
    }

    const user = await this.users.create({
      id: uuidv7(),
      phone: input.phone ?? null,
      email: input.email ?? null,
      passwordHash: await this.passwords.hash(input.password),
      displayName: input.displayName,
      locale: input.locale,
    });

    const deviceId = 'bootstrap';    // a real per-install device id arrives in Plan 2
    await this.pool.execute(SQL_UPSERT_DEVICE, {
      id: deviceId, userId: user.id, platform: 'ANDROID',
      model: null, appVersion: null, pushToken: null,
    });

    const issued = await this.tokens.issue(user.id, deviceId);
    return this.#present(user, { ...issued, memberships: await this.#loadMemberships(user.id) });
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const user = await this.users.findByIdentifier(input.identifier);
    const invalid = new AppError('AUTH_INVALID_CREDENTIALS', 'Phone, email or password is incorrect');

    if (!user) {
      // Equalise timing so latency does not reveal whether the account exists.
      await this.passwords.verify(DUMMY_HASH, input.password);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new AppError('AUTH_ACCOUNT_LOCKED', 'Too many attempts. Try again shortly.');
    }
    if (!await this.passwords.verify(user.passwordHash, input.password)) {
      await this.users.recordFailedAttempt(user.id);
      throw invalid;
    }

    await this.users.clearFailedAttempts(user.id);
    await this.pool.execute(SQL_UPSERT_DEVICE, {
      id: input.device.id, userId: user.id, platform: input.device.platform,
      model: input.device.model ?? null,
      appVersion: input.device.appVersion ?? null,
      pushToken: input.device.pushToken ?? null,
    });

    const issued = await this.tokens.issue(user.id, input.device.id);
    return this.#present(user, { ...issued, memberships: await this.#loadMemberships(user.id) });
  }

  /**
   * No `memberships` here — refresh is a lightweight token rotation, not a full re-login.
   * Entitlement changes reach the client via sync (FR-SUB-9), not this endpoint.
   */
  async refresh(refreshToken: string, deviceId: string): Promise<Omit<AuthResponse, 'user' | 'memberships'>> {
    return this.tokens.rotate(refreshToken, deviceId);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revokeByRefreshToken(refreshToken);
  }

  async me(userId: string): Promise<AuthResponse['user']> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');
    return {
      id: user.id, displayName: user.displayName, locale: user.locale,
      phone: user.phone, email: user.email,
    };
  }
}
