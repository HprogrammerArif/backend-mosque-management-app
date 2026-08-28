import { z } from 'zod';
import { DONATION_METHODS } from '../../domain/enums.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createDonationSchema = z.object({
  fundId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.enum(['BDT', 'USD', 'GBP', 'EUR']).default('BDT'),
  occurredOn: isoDate,
  method: z.enum(DONATION_METHODS),
  donorHouseholdId: z.string().nullable().default(null),
  donorName: z.string().max(200).nullable().default(null),
  anonymous: z.boolean().default(false),
  receiptNo: z.string().max(30).nullable().default(null),
  note: z.string().max(500).nullable().default(null),
}).strip();

export const adjustDonationSchema = z.object({
  reason: z.string().min(1).max(500),
}).strip();

export const donationResponseSchema = z.object({
  id: z.string(),
  fundId: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  occurredOn: z.string(),
  method: z.enum(DONATION_METHODS),
  donorHouseholdId: z.string().nullable(),
  donorName: z.string().nullable(),
  anonymous: z.boolean(),
  receiptNo: z.string().nullable(),
  note: z.string().nullable(),
  adjustsId: z.string().nullable(),
  adjustmentReason: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export const fundBalanceResponseSchema = z.object({
  fundId: z.string(),
  totalMinor: z.number().int(),
});

export type CreateDonationRequest = z.infer<typeof createDonationSchema>;
export type AdjustDonationRequest = z.infer<typeof adjustDonationSchema>;
