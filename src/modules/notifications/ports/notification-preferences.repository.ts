export type NotificationPreferencesRecord = {
  userId: string;
  announcements: boolean;
  duesReminders: boolean;
  prayerReminders: boolean;
  events: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export type UpsertNotificationPreferencesInput = {
  userId: string;
  announcements: boolean;
  duesReminders: boolean;
  prayerReminders: boolean;
  events: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
};

/** Global (no TENANT_ID) — belongs to the user, not a mosque. */
export interface NotificationPreferencesRepository {
  findByUserId(userId: string): Promise<NotificationPreferencesRecord | null>;
  upsert(input: UpsertNotificationPreferencesInput): Promise<NotificationPreferencesRecord>;
}
