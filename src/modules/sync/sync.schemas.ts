import { z } from 'zod';

export const SYNC_ENTITIES = ['donations', 'households'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const bootstrapRequestSchema = z.object({
  entities: z.array(z.enum(SYNC_ENTITIES)).min(1),
}).strip();

const donationPayloadSchema = z.object({
  fundId: z.string().min(1),
  amountMinor: z.number().int(),
  currency: z.enum(['BDT', 'USD', 'GBP', 'EUR']).default('BDT'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(['CASH', 'BANK', 'MOBILE_MONEY', 'CARD', 'CHEQUE', 'IN_KIND']),
  donorHouseholdId: z.string().nullable().default(null),
  donorName: z.string().max(200).nullable().default(null),
  anonymous: z.boolean().default(false),
  receiptNo: z.string().max(30).nullable().default(null),
  note: z.string().max(500).nullable().default(null),
  adjustsId: z.string().nullable().default(null),
  adjustmentReason: z.string().max(500).nullable().default(null),
});

const householdPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  addressLine1: z.string().max(200).nullable().default(null),
  area: z.string().max(100).nullable().default(null),
  phone: z.string().max(20).nullable().default(null),
  monthlyDuesMinor: z.number().int().min(0).default(0),
  exempt: z.boolean().default(false),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const mutationSchema = z.object({
  mutationId: z.string().min(1),
  entity: z.enum(SYNC_ENTITIES),
  entityId: z.string().min(1),
  op: z.enum(['insert', 'update', 'delete']),
  hlc: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  payload: z.union([donationPayloadSchema, householdPayloadSchema]),
});

export const pushRequestSchema = z.object({
  deviceId: z.string().min(1),
  mutations: z.array(mutationSchema).max(200),
}).strip();

export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;
export type PushRequest = z.infer<typeof pushRequestSchema>;
export type Mutation = z.infer<typeof mutationSchema>;
export type DonationPayload = z.infer<typeof donationPayloadSchema>;
export type HouseholdPayload = z.infer<typeof householdPayloadSchema>;
