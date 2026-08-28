import { z } from 'zod';

const isoDateTime = z.string().datetime({ offset: true });

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().default(null),
  startsAt: isoDateTime,
  endsAt: isoDateTime.nullable().default(null),
  location: z.string().max(200).nullable().default(null),
}).strip();

export const eventResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  location: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export type CreateEventRequest = z.infer<typeof createEventSchema>;
