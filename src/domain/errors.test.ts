import { describe, it, expect } from 'vitest';
import { ERROR_STATUS, type ErrorCode } from './errors.js';

describe('error taxonomy', () => {
  it('maps every code to an HTTP status', () => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) {
      expect(status, `${code} has no status`).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it('classifies a business rule refusal as 409, not 422', () => {
    // A fund restriction is a valid request the domain refuses, not malformed input.
    expect(ERROR_STATUS['RULE_FUND_RESTRICTION_VIOLATED']).toBe(409);
  });

  it('classifies a plan gate as 402', () => {
    expect(ERROR_STATUS['FEATURE_NOT_IN_PLAN']).toBe(402);
  });

  it('classifies a missing required header as 400, not 422', () => {
    expect(ERROR_STATUS['IDEMPOTENCY_KEY_REQUIRED']).toBe(400);
  });

  it('has no duplicate codes', () => {
    const codes = Object.keys(ERROR_STATUS) as ErrorCode[];
    expect(new Set(codes).size).toBe(codes.length);
  });
});
