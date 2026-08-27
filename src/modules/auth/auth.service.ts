import { uuidv7 } from 'uuidv7';
import type { AuthResponse, LoginInput, RegisterInput } from './auth.schemas.js';
import { AppError } from '../../common/errors/app-error.js';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import type { PasswordService } from './password.service.js';
import type { TokenService } from './token.service.js';
import type { UserRepository, UserRecord } from './ports/user.repository.js';

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

    return this.#present(user, await this.tokens.issue(user.id, deviceId));
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

    return this.#present(user, await this.tokens.issue(user.id, input.device.id));
  }

  async refresh(refreshToken: string, deviceId: string): Promise<Omit<AuthResponse, 'user'>> {
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
