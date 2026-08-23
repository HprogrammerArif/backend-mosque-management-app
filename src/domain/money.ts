/**
 * Money as integer minor units (BR-9).
 *
 * DUPLICATED in mosque-frontend/src/lib/money.ts by deliberate decision
 * (ADR-0011). The identical test suite runs in both repositories, so
 * behavioural divergence fails a build rather than corrupting a ledger.
 * If you change this file, change the other one and both test suites.
 */

export type Currency = 'BDT' | 'USD' | 'GBP' | 'EUR';

export type Money = {
  readonly amountMinor: number;
  readonly currency: Currency;
};

/** Minor-unit exponent per currency. All four are 2, but the table makes the rule explicit. */
const MINOR_EXPONENT: Record<Currency, number> = { BDT: 2, USD: 2, GBP: 2, EUR: 2 };

export function money(amountMinor: number, currency: Currency): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money must be integer minor units, received ${amountMinor} (BR-9)`);
  }
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`Money exceeds safe integer range: ${amountMinor}`);
  }
  return { amountMinor, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} and ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negateMoney(a: Money): Money {
  return money(-a.amountMinor, a.currency);
}

export function sumMoney(items: readonly Money[], currency: Currency): Money {
  let total = 0;
  for (const item of items) {
    if (item.currency !== currency) {
      throw new Error(`Currency mismatch: expected ${currency}, received ${item.currency}`);
    }
    total += item.amountMinor;
  }
  return money(total, currency);
}

export function formatMoney(m: Money, locale: string): string {
  // The only division in the money path, at the display boundary, after all
  // arithmetic is complete. Nothing downstream consumes this result numerically.
  const major = m.amountMinor / 10 ** MINOR_EXPONENT[m.currency];
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: MINOR_EXPONENT[m.currency],
  }).format(major);
}
