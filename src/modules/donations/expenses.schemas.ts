import { z } from 'zod';
import { DONATION_METHODS } from '../../domain/enums.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createExpenseSchema = z.object({
  fundId: z.string().min(1),
  categoryId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.enum(['BDT', 'USD', 'GBP', 'EUR']).default('BDT'),
  occurredOn: isoDate,
  payee: z.string().max(200).nullable().default(null),
  description: z.string().max(500).nullable().default(null),
  method: z.enum(DONATION_METHODS),
}).strip();

export const adjustExpenseSchema = z.object({
  reason: z.string().min(1).max(500),
}).strip();

export const expenseResponseSchema = z.object({
  id: z.string(),
  fundId: z.string(),
  categoryId: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  occurredOn: z.string(),
  payee: z.string().nullable(),
  description: z.string().nullable(),
  method: z.enum(DONATION_METHODS),
  approvalStatus: z.enum(['DRAFT', 'PENDING', 'POSTED', 'REJECTED']),
  adjustsId: z.string().nullable(),
  adjustmentReason: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export type CreateExpenseRequest = z.infer<typeof createExpenseSchema>;
