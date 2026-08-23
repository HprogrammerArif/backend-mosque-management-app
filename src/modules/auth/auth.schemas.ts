import { z } from 'zod';

/**
 * These schemas are the SOURCE OF TRUTH for the API contract.
 *
 * `openapi.json` is generated from them, and the frontend repository generates its
 * types from that document (ADR-0011). Nothing here is written twice — if you change a
 * schema, run `pnpm openapi` and commit the result, or CI will fail.
 */

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a phone number with country code');
const password = z.string().min(8, 'Use at least 8 characters').max(200);

export const deviceSchema = z.object({
  id: z.string().min(1),
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
  model: z.string().max(120).optional(),
  appVersion: z.string().max(20).optional(),
  pushToken: z.string().max(255).optional(),
}).strip();

export const registerSchema = z.object({
  phone: phone.optional(),
  email: z.string().email().optional(),
  password,
  displayName: z.string().min(1).max(120),
  locale: z.string().max(10).default('en'),
}).strip().refine(
  (v) => v.phone !== undefined || v.email !== undefined,
  { message: 'Provide a phone number or an email address', path: ['phone'] },
);

export const loginSchema = z.object({
  identifier: z.string().min(1),          // phone or email
  password: z.string().min(1),
  device: deviceSchema,
}).strip();

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1),
}).strip();

export const authResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    displayName: z.string(),
    locale: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
  }),
});

export type DeviceInput = z.infer<typeof deviceSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
