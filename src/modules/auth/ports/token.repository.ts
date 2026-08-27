export type TokenRecord = {
  id: string;
  userId: string;
  deviceId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  /**
   * Non-null only when THIS token was individually rotated away for a newer one.
   * Null when it was swept into a family-wide revocation instead — that distinction
   * is what lets rotate() tell "this exact token is being replayed" (a real theft
   * signal) apart from "this session was already terminated by a sibling's replay".
   */
  replacedBy: string | null;
};

export interface TokenRepository {
  insert(record: TokenRecord & { tokenHash: string }): Promise<void>;
  findByHash(tokenHash: string): Promise<TokenRecord | null>;
  revoke(id: string, replacedBy: string | null): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}
