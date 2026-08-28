import { z } from 'zod';
import { DUES_CHARGE_STATUSES, DONATION_METHODS } from '../../domain/enums.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM');

export const generateDuesSchema = z.object({
  period,
}).strip();

export const recordDuesPaymentSchema = z.object({
  fundId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.enum(['BDT', 'USD', 'GBP', 'EUR']).default('BDT'),
  paidOn: isoDate,
  method: z.enum(DONATION_METHODS),
  collectedBy: z.string().nullable().default(null),
}).strip();

export const waiveDuesChargeSchema = z.object({
  reason: z.string().min(1).max(500),
}).strip();

export const duesChargeResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  period: z.string(),
  amountMinor: z.number().int(),
  paidMinor: z.number().int(),
  currency: z.string(),
  dueOn: z.string(),
  status: z.enum(DUES_CHARGE_STATUSES),
  waivedBy: z.string().nullable(),
  waivedReason: z.string().nullable(),
});

export const duesPaymentResponseSchema = z.object({
  id: z.string(),
  chargeId: z.string(),
  fundId: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  paidOn: z.string(),
  method: z.enum(DONATION_METHODS),
  collectedBy: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export type GenerateDuesRequest = z.infer<typeof generateDuesSchema>;
export type RecordDuesPaymentRequest = z.infer<typeof recordDuesPaymentSchema>;
export type WaiveDuesChargeRequest = z.infer<typeof waiveDuesChargeSchema>;
