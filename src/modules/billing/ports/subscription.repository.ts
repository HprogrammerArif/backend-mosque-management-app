import type { Tx } from '../../../infrastructure/database/oracle.pool.js';

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type SubscriptionRecord = {
  id: string;
  mosqueId: string;
  planCode: string;
  status: SubscriptionStatus;
  billingPeriod: string;
  priceMinor: number;
  currency: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  provider: string | null;
  providerRef: string | null;
};

export type CreateSubscriptionInput = {
  id: string;
  mosqueId: string;
  planCode: string;
  status: SubscriptionStatus;
};

/** Global (no TENANT_ID) — one row per mosque (UX_SUB_MOSQUE), keyed by MOSQUE_ID not VPD. */
export interface SubscriptionRepository {
  findByMosqueId(mosqueId: string): Promise<SubscriptionRecord | null>;
  create(input: CreateSubscriptionInput, tx?: Tx): Promise<SubscriptionRecord>;
  /** Mock billing only — sets PLAN_CODE, STATUS=ACTIVE, a fresh 30-day period, PROVIDER='MOCK'. No real payment. */
  mockSetPlan(mosqueId: string, planCode: string): Promise<SubscriptionRecord>;
}
