import { z } from 'zod';
import { SUBSCRIPTION_STATUSES } from './ports/subscription.repository.js';

export const mockSetPlanSchema = z.object({
  planCode: z.string().min(1).max(20),
}).strip();

export const entitlementsResponseSchema = z.object({
  features: z.array(z.string()),
  limits: z.object({
    adminUsers: z.number().int().nullable(),
    members: z.number().int().nullable(),
    historyMonths: z.number().int().nullable(),
  }),
});

export const planResponseSchema = z.object({
  code: z.string(),
  name: z.string(),
  entitlements: entitlementsResponseSchema,
  active: z.boolean(),
});

export const subscriptionResponseSchema = z.object({
  id: z.string(),
  mosqueId: z.string(),
  planCode: z.string(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  billingPeriod: z.string(),
  priceMinor: z.number().int(),
  currency: z.string(),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  provider: z.string().nullable(),
  providerRef: z.string().nullable(),
});

export const billingSummaryResponseSchema = z.object({
  subscription: subscriptionResponseSchema,
  plan: planResponseSchema,
});

export type MockSetPlanRequest = z.infer<typeof mockSetPlanSchema>;
