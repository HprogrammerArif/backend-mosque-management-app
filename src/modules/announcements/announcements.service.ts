import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleAnnouncementRepository } from '../../infrastructure/repositories/oracle/oracle-announcement.repository.js';
import type { AnnouncementRecord } from './ports/announcement.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateAnnouncementRequest } from './announcements.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

const DEFAULT_LIST_LIMIT = 50;

export class AnnouncementsService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleAnnouncementRepository {
    return new OracleAnnouncementRepository(this.pool, ctx);
  }

  async create(ctx: TenantContext, input: CreateAnnouncementRequest): Promise<AnnouncementRecord> {
    const created = await this.#repo(ctx).create({ id: uuidv7(), ...input, createdBy: ctx.userId });
    if (created.urgent) this.#notifyUrgent(ctx, created);
    return created;
  }

  async listRecent(ctx: TenantContext, limit = DEFAULT_LIST_LIMIT): Promise<AnnouncementRecord[]> {
    return this.#repo(ctx).listRecent(limit);
  }

  async getById(ctx: TenantContext, id: string): Promise<AnnouncementRecord> {
    const announcement = await this.#repo(ctx).findById(id);
    if (!announcement) throw new AppError('NOT_FOUND', `Announcement ${id} not found`);
    return announcement;
  }

  /**
   * The janazah urgent path's actual delivery leg. **Named gap**: no device push token
   * registry exists yet (no notification-preferences module, no Expo push token storage) —
   * so this can't do a real `expo-server-sdk` send today. Logs instead of pretending to
   * have delivered anything, so the gap is visible rather than silently faked. Wiring this
   * up is: collect Expo push tokens per device (their own registry + opt-in UI), then
   * replace this body with an `Expo.sendPushNotificationsAsync` call fanning out to every
   * token for `ctx.tenantId`.
   */
  #notifyUrgent(ctx: TenantContext, announcement: AnnouncementRecord): void {
    console.warn(
      `[announcements] URGENT "${announcement.title}" posted for tenant ${ctx.tenantId} — ` +
      'push delivery not yet wired (no device token registry); see AnnouncementsService.#notifyUrgent.',
    );
  }
}
