import { describe, it, expect } from 'vitest';
import { PasswordService } from './password.service.js';

const service = new PasswordService();

describe('PasswordService', () => {
  it('produces an argon2id hash', async () => {
    const hash = await service.hash('correct-horse-battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a correct password', async () => {
    const hash = await service.hash('correct-horse-battery');
    expect(await service.verify(hash, 'correct-horse-battery')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await service.hash('correct-horse-battery');
    expect(await service.verify(hash, 'wrong-password')).toBe(false);
  });

  it('salts — the same password hashes differently each time', async () => {
    const a = await service.hash('same-password');
    const b = await service.hash('same-password');
    expect(a).not.toBe(b);
  });

  it('returns false rather than throwing on a malformed hash', async () => {
    expect(await service.verify('not-a-hash', 'anything')).toBe(false);
  });
});
