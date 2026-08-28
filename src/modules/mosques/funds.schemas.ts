import { z } from 'zod';
import { FUND_TYPES } from '../../domain/enums.js';

export const fundResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  type: z.enum(FUND_TYPES),
  name: z.string(),
  zakatEligible: z.boolean(),
  corpusMinor: z.number().int(),
});

/** BR-2: a corpus change is deliberate, Admin-authorised, and must carry a reason. */
export const setFundCorpusSchema = z.object({
  corpusMinor: z.number().int().min(0),
  reason: z.string().min(1).max(500),
}).strip();

export type SetFundCorpusRequest = z.infer<typeof setFundCorpusSchema>;
