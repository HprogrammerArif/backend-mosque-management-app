import { describe, it, expect } from 'vitest';
import { money, addMoney, subtractMoney, negateMoney, sumMoney, formatMoney } from './money.js';

describe('money', () => {
  it('stores minor units as an integer', () => {
    expect(money(50000, 'BDT')).toEqual({ amountMinor: 50000, currency: 'BDT' });
  });

  it('rejects a non-integer amount', () => {
    expect(() => money(500.5, 'BDT')).toThrow(/integer minor units/);
  });

  it('adds two amounts of the same currency', () => {
    expect(addMoney(money(50000, 'BDT'), money(2500, 'BDT')).amountMinor).toBe(52500);
  });

  it('refuses to add different currencies', () => {
    expect(() => addMoney(money(100, 'BDT'), money(100, 'USD'))).toThrow(/currency/i);
  });

  it('subtracts, allowing a negative result for adjustment entries', () => {
    expect(subtractMoney(money(100, 'BDT'), money(250, 'BDT')).amountMinor).toBe(-150);
  });

  it('negates for adjustment entries', () => {
    expect(negateMoney(money(50000, 'BDT')).amountMinor).toBe(-50000);
  });

  it('sums an empty list to zero of the stated currency', () => {
    expect(sumMoney([], 'BDT')).toEqual({ amountMinor: 0, currency: 'BDT' });
  });

  it('sums a list exactly, with no floating point drift', () => {
    const items = Array.from({ length: 1000 }, () => money(1, 'BDT'));
    expect(sumMoney(items, 'BDT').amountMinor).toBe(1000);
  });

  it('formats BDT with Indian digit grouping', () => {
    expect(formatMoney(money(482300, 'BDT'), 'en-IN')).toContain('4,823');
  });

  it('formats USD with Western grouping', () => {
    expect(formatMoney(money(482300, 'USD'), 'en-US')).toContain('4,823');
  });
});
