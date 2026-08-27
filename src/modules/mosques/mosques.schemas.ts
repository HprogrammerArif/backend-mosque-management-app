import { z } from 'zod';

/**
 * Source of truth for the API contract (same discipline as auth.schemas.ts) — run
 * `pnpm openapi` and commit the result after any change here.
 */
export const createMosqueSchema = z.object({
  name: z.string().min(1).max(200),
  timezone: z.string().min(1).max(50),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
}).strip();

export const mosqueResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  status: z.enum(['PROVISIONING', 'ACTIVE', 'SUSPENDED', 'PENDING_DELETION', 'PURGED']),
});

export type CreateMosqueRequest = z.infer<typeof createMosqueSchema>;
export type MosqueResponse = z.infer<typeof mosqueResponseSchema>;
