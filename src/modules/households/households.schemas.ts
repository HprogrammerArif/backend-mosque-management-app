import { z } from 'zod';
import { HOUSEHOLD_STATUSES } from '../../domain/enums.js';

export const createHouseholdSchema = z.object({
  name: z.string().min(1).max(200),
  addressLine1: z.string().max(200).nullable().default(null),
  area: z.string().max(100).nullable().default(null),
  phone: z.string().max(20).nullable().default(null),
  monthlyDuesMinor: z.number().int().min(0).default(0),
  collectorUserId: z.string().nullable().default(null),
  exempt: z.boolean().default(false),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
}).strip();

export const householdResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  headIndividualId: z.string().nullable(),
  addressLine1: z.string().nullable(),
  area: z.string().nullable(),
  phone: z.string().nullable(),
  monthlyDuesMinor: z.number().int(),
  collectorUserId: z.string().nullable(),
  exempt: z.boolean(),
  joinedOn: z.string().nullable(),
  status: z.enum(HOUSEHOLD_STATUSES),
});

export type CreateHouseholdRequest = z.infer<typeof createHouseholdSchema>;
