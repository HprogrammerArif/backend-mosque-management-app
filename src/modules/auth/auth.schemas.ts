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

const membershipEntitlementsSchema = z.object({
  features: z.array(z.string()),
  limits: z.object({
    adminUsers: z.number().int().nullable(),
    members: z.number().int().nullable(),
    historyMonths: z.number().int().nullable(),
  }),
});

const userResponseSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  locale: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

// Read at login/register and refreshed on sync, so plan gating stays correct offline
// (FR-SUB-9) — the app never has to make a live call just to know what it's allowed to show.
const membershipsResponseSchema = z.array(z.object({
  mosqueId: z.string(),
  mosqueName: z.string(),
  role: z.string(),
  plan: z.string().nullable(),
  entitlements: membershipEntitlementsSchema,
}));

export const authResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  refreshToken: z.string(),
  user: userResponseSchema,
  memberships: membershipsResponseSchema,
});

// GET /auth/me's shape — no tokens (nothing was just issued), but memberships ARE
// included here even though the original login/register response also carries them:
// this is the one endpoint a client can call to re-sync its membership list after an
// action that changes it (creating a mosque, accepting an invitation) without forcing a
// full re-login, closing the "memberships go stale until next sign-in" gap noted in the
// frontend's session store.
export const meResponseSchema = z.object({
  user: userResponseSchema,
  memberships: membershipsResponseSchema,
});

export type DeviceInput = z.infer<typeof deviceSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
