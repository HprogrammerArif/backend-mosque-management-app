import { z } from 'zod';

export const SYNC_ENTITIES = ['donations', 'households'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const bootstrapRequestSchema = z.object({
  entities: z.array(z.enum(SYNC_ENTITIES)).min(1),
}).strip();

const donationPayloadSchema = z.object({
  fundId: z.string().min(1),
  // Positive, and adjustsId/adjustmentReason locked to null: sync only ever supports
  // inserting a fresh donation (#applyDonation rejects update/delete outright). Creating
  // an adjustment entry is a REST-only, server-computed operation (DonationsService.adjust
  // negates the original amount itself) — no frontend path builds an offline adjustment
  // mutation, so accepting a client-supplied negative amount or arbitrary adjustsId here
  // would only ever be exploitable, never legitimate: it'd let a synced insert forge an
  // unaudited correction against any donation ID without going through `adjust()`'s
  // append-only trail.
  amountMinor: z.number().int().positive(),
  currency: z.enum(['BDT', 'USD', 'GBP', 'EUR']).default('BDT'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(['CASH', 'BANK', 'MOBILE_MONEY', 'CARD', 'CHEQUE', 'IN_KIND']),
  donorHouseholdId: z.string().nullable().default(null),
  donorName: z.string().max(200).nullable().default(null),
  anonymous: z.boolean().default(false),
  receiptNo: z.string().max(30).nullable().default(null),
  note: z.string().max(500).nullable().default(null),
  adjustsId: z.null().default(null),
  adjustmentReason: z.null().default(null),
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
  /**
   * Field-merge entities only (offline-sync-protocol.md §6.2) — which keys in `payload`
   * this specific write actually intends to change. The payload itself always carries
   * every field (the client's local cache is a full row, never a diff), so without this
   * the server can't distinguish "the user edited this field" from "this field's old
   * value just came along for the ride" — comparing one mutation-level hlc against every
   * field would make a later write win on ALL fields, collapsing field-level merge into
   * ordinary row-level LWW. Ignored for inserts and for donations.
   */
  changedFields: z.array(z.string()).default([]),
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
