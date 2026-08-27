import argon2 from 'argon2';

/** Tuned to roughly 250ms on the target OCI ARM VM. Re-measure if the host changes. */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,   // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export class PasswordService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // A malformed stored hash must read as "does not match", never as a 500.
      return false;
    }
  }
}
