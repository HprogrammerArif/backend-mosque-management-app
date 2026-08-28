import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const incomeExpenditureQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
});

export const incomeExpenditureResponseSchema = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  incomeMinor: z.number().int(),
  expenditureMinor: z.number().int(),
  netMinor: z.number().int(),
});

export const fundBalanceResponseSchema = z.object({
  fundId: z.string(),
  fundName: z.string(),
  balanceMinor: z.number().int(),
});

export const donationTrendResponseSchema = z.object({
  period: z.string(),
  totalMinor: z.number().int(),
});
