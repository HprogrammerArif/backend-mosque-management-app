import type { OraclePool } from '../../database/oracle.pool.js';
import type {
  NotificationPreferencesRepository, NotificationPreferencesRecord, UpsertNotificationPreferencesInput,
} from '../../../modules/notifications/ports/notification-preferences.repository.js';

type Row = {
  user_id: string; announcements: number; dues_reminders: number;
  prayer_reminders: number; events: number; quiet_hours_start: string; quiet_hours_end: string;
};

const COLUMNS = `USER_ID, ANNOUNCEMENTS, DUES_REMINDERS, PRAYER_REMINDERS, EVENTS,
  QUIET_HOURS_START, QUIET_HOURS_END`;

const SQL_FIND_BY_USER = `SELECT ${COLUMNS} FROM NOTIFICATION_PREFERENCES WHERE USER_ID = :userId`;

const SQL_UPSERT = `
  MERGE INTO NOTIFICATION_PREFERENCES t
  USING (SELECT :userId AS USER_ID FROM DUAL) s ON (t.USER_ID = s.USER_ID)
  WHEN MATCHED THEN UPDATE SET
    ANNOUNCEMENTS = :announcements, DUES_REMINDERS = :duesReminders,
    PRAYER_REMINDERS = :prayerReminders, EVENTS = :events,
    QUIET_HOURS_START = :quietHoursStart, QUIET_HOURS_END = :quietHoursEnd,
    UPDATED_AT = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (
    USER_ID, ANNOUNCEMENTS, DUES_REMINDERS, PRAYER_REMINDERS, EVENTS, QUIET_HOURS_START, QUIET_HOURS_END
  ) VALUES (
    :userId, :announcements, :duesReminders, :prayerReminders, :events, :quietHoursStart, :quietHoursEnd
  )`;

function toRecord(row: Row): NotificationPreferencesRecord {
  return {
    userId: row.user_id,
    announcements: Number(row.announcements) === 1,
    duesReminders: Number(row.dues_reminders) === 1,
    prayerReminders: Number(row.prayer_reminders) === 1,
    events: Number(row.events) === 1,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
  };
}

export class OracleNotificationPreferencesRepository implements NotificationPreferencesRepository {
  constructor(private readonly pool: OraclePool) {}

  async findByUserId(userId: string): Promise<NotificationPreferencesRecord | null> {
    const rows = await this.pool.execute<Row>(SQL_FIND_BY_USER, { userId });
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async upsert(input: UpsertNotificationPreferencesInput): Promise<NotificationPreferencesRecord> {
    const binds = {
      ...input,
      announcements: input.announcements ? 1 : 0,
      duesReminders: input.duesReminders ? 1 : 0,
      prayerReminders: input.prayerReminders ? 1 : 0,
      events: input.events ? 1 : 0,
    };
    await this.pool.execute(SQL_UPSERT, binds);
    return { ...input };
  }
}
