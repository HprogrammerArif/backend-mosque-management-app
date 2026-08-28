import { z } from 'zod';
import { COMMITTEE_STATUSES } from '../../domain/enums.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createCommitteeMemberSchema = z.object({
  name: z.string().min(1).max(200),
  position: z.string().max(100).nullable().default(null),
  phone: z.string().max(20).nullable().default(null),
  termStart: isoDate.nullable().default(null),
  termEnd: isoDate.nullable().default(null),
}).strip();

export const committeeMemberResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  termStart: z.string().nullable(),
  termEnd: z.string().nullable(),
  status: z.enum(COMMITTEE_STATUSES),
});

export type CreateCommitteeMemberRequest = z.infer<typeof createCommitteeMemberSchema>;
