import { z } from 'zod';
import { FUND_TYPES } from '../../domain/enums.js';

export const fundResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  type: z.enum(FUND_TYPES),
  name: z.string(),
  zakatEligible: z.boolean(),
});
