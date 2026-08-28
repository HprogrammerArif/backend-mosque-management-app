import type { OracleNotificationPreferencesRepository } from '../../infrastructure/repositories/oracle/oracle-notification-preferences.repository.js';
import type { NotificationPreferencesRecord } from './ports/notification-preferences.repository.js';
import type { UpdateNotificationPreferencesRequest } from './notification-preferences.schemas.js';

const DEFAULTS: Omit<NotificationPreferencesRecord, 'userId'> = {
  announcements: true, duesReminders: true, prayerReminders: true, events: true,
  quietHoursStart: '22:00', quietHoursEnd: '06:00',
};

export class NotificationPreferencesService {
  constructor(private readonly repo: OracleNotificationPreferencesRepository) {}

  async get(userId: string): Promise<NotificationPreferencesRecord> {
    const existing = await this.repo.findByUserId(userId);
    return existing ?? { userId, ...DEFAULTS };
  }

  async update(userId: string, input: UpdateNotificationPreferencesRequest): Promise<NotificationPreferencesRecord> {
    return this.repo.upsert({ userId, ...input });
  }
}
