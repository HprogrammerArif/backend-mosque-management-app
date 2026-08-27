import { z } from 'zod';
import { ROLES } from '../../domain/enums.js';

export const createInvitationSchema = z.object({
  emailOrPhone: z.string().min(1).max(255),
  role: z.enum(ROLES),
}).strip();

export const invitationResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});

export const acceptInvitationSchema = z.object({}).strip();

export const membershipResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  role: z.enum(ROLES),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']),
});

export const updateMembershipSchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']).optional(),
}).strip().refine(
  (v) => v.role !== undefined || v.status !== undefined,
  { message: 'Provide role and/or status to update' },
);

export type CreateInvitationRequest = z.infer<typeof createInvitationSchema>;
export type UpdateMembershipRequest = z.infer<typeof updateMembershipSchema>;
