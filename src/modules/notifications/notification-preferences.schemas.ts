import { z } from 'zod';

const quietHour = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');

export const updateNotificationPreferencesSchema = z.object({
  announcements: z.boolean().default(true),
  duesReminders: z.boolean().default(true),
  prayerReminders: z.boolean().default(true),
  events: z.boolean().default(true),
  quietHoursStart: quietHour.default('22:00'),
  quietHoursEnd: quietHour.default('06:00'),
}).strip();

export const notificationPreferencesResponseSchema = z.object({
  announcements: z.boolean(),
  duesReminders: z.boolean(),
  prayerReminders: z.boolean(),
  events: z.boolean(),
  quietHoursStart: z.string(),
  quietHoursEnd: z.string(),
});

export type UpdateNotificationPreferencesRequest = z.infer<typeof updateNotificationPreferencesSchema>;
