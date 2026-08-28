import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  urgent: z.boolean().default(false),
}).strip();

export const announcementResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  urgent: z.boolean(),
  createdBy: z.string(),
  createdAt: z.string(),
});

export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementSchema>;
