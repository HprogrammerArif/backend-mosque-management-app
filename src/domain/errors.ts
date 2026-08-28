/**
 * The error taxonomy. Codes are stable and machine-readable; the client maps them to
 * translated copy and never displays the `message`, which exists for logs and developers
 * (NFR-USE-4, NFR-I18N-1).
 *
 * Status is derived from the code, so one code cannot be mapped to two statuses in two
 * places. These codes also appear in the generated OpenAPI contract.
 */
export const ERROR_STATUS = {
  // auth
  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_REUSED: 401,
  AUTH_ACCOUNT_LOCKED: 401,
  AUTH_EMAIL_TAKEN: 409,
  AUTH_PHONE_TAKEN: 409,
  // permissions
  PERM_DENIED: 403,
  PERM_ROLE_REQUIRED: 403,
  // plan gating
  FEATURE_NOT_IN_PLAN: 402,
  FEATURE_LIMIT_REACHED: 402,
  // tenancy
  TENANT_ID_REQUIRED: 400,
  TENANT_NOT_FOUND: 404,
  TENANT_SUSPENDED: 403,
  TENANT_READONLY: 403,
  // invitations
  INVITATION_EXPIRED: 409,
  INVITATION_ALREADY_ACCEPTED: 409,
  // validation
  VALIDATION_FAILED: 422,
  // business rules — a valid request the domain refuses, hence 409 rather than 422
  RULE_FUND_RESTRICTION_VIOLATED: 409,
  RULE_WAQF_CORPUS_PROTECTED: 409,
  RULE_LEDGER_IMMUTABLE: 409,
  RULE_LAST_ADMIN: 409,
  RULE_DUES_ALREADY_SETTLED: 409,
  RULE_DUES_OVERPAYMENT: 409,
  // sync
  SYNC_CURSOR_TOO_OLD: 409,
  SYNC_DEPENDENCY_NOT_FOUND: 409,
  SYNC_EPOCH_MISMATCH: 409,
  // generic
  CONFLICT_VERSION_MISMATCH: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  NOT_FOUND: 404,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_ERROR: 500,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type AppErrorShape = {
  code: ErrorCode;
  message: string;
  requestId?: string;
  details?: unknown;
};
