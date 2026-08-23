import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from './auth.schemas.js';

describe('registerSchema', () => {
  it('accepts a phone-only registration', () => {
    const r = registerSchema.safeParse({
      phone: '+8801712345678', password: 'correct-horse', displayName: 'Kamal Hossain',
    });
    expect(r.success).toBe(true);
  });

  it('accepts an email-only registration', () => {
    const r = registerSchema.safeParse({
      email: 'kamal@example.com', password: 'correct-horse', displayName: 'Kamal Hossain',
    });
    expect(r.success).toBe(true);
  });

  it('rejects registration with neither phone nor email', () => {
    const r = registerSchema.safeParse({ password: 'correct-horse', displayName: 'Kamal' });
    expect(r.success).toBe(false);
  });

  it('rejects a password under 8 characters', () => {
    const r = registerSchema.safeParse({
      phone: '+8801712345678', password: 'short', displayName: 'Kamal',
    });
    expect(r.success).toBe(false);
  });

  it('strips unknown properties rather than passing them through', () => {
    const r = loginSchema.parse({
      identifier: '+8801712345678', password: 'correct-horse',
      device: { id: '01J9', platform: 'ANDROID' },
      isAdmin: true,
    } as never);
    expect('isAdmin' in r).toBe(false);
  });
});
