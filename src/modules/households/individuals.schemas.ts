import { z } from 'zod';
import { RELATIONS } from '../../domain/enums.js';

export const createIndividualSchema = z.object({
  userId: z.string().nullable().default(null),
  fullName: z.string().min(1).max(200),
  relation: z.enum(RELATIONS),
  phone: z.string().max(20).nullable().default(null),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  gender: z.string().max(10).nullable().default(null),
}).strip();

export const individualResponseSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  userId: z.string().nullable(),
  fullName: z.string(),
  relation: z.enum(RELATIONS),
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  gender: z.string().nullable(),
});

export type CreateIndividualRequest = z.infer<typeof createIndividualSchema>;
