export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export type UserRecord = {
  id: string;
  phone: string | null;
  email: string | null;
  passwordHash: string;
  displayName: string;
  locale: string;
  status: UserStatus;
  failedAttempts: number;
  lockedUntil: Date | null;
};

export type CreateUserInput = {
  id: string;
  phone: string | null;
  email: string | null;
  passwordHash: string;
  displayName: string;
  locale: string;
};

/**
 * No SQL, no driver types, no `tenantId` parameter. A PostgreSQL implementation could
 * satisfy this without a single change — that portability is the whole point of the
 * port/adapter split (ADR-0002).
 */
export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  /** identifier is a phone number or an email address */
  findByIdentifier(identifier: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  recordFailedAttempt(id: string): Promise<void>;
  clearFailedAttempts(id: string): Promise<void>;
}
