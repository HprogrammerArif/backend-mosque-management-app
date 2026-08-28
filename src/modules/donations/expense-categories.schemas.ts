import { z } from 'zod';

const ASNAF = [
  'FUQARA', 'MASAKIN', 'AMILIN', 'MUALLAFAT', 'RIQAB', 'GHARIMIN', 'FI_SABILILLAH', 'IBN_SABIL',
] as const;

export const createExpenseCategorySchema = z.object({
  name: z.string().min(1).max(100),
  zakatEligible: z.boolean().default(false),
  asnafCategory: z.enum(ASNAF).nullable().default(null),
}).strip();

export const expenseCategoryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  zakatEligible: z.boolean(),
  asnafCategory: z.enum(ASNAF).nullable(),
  isSystem: z.boolean(),
});

export type CreateExpenseCategoryRequest = z.infer<typeof createExpenseCategorySchema>;
