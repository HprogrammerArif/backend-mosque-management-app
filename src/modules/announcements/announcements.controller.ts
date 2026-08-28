import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateAnnouncementRequest } from './announcements.schemas.js';
import type { AnnouncementsService } from './announcements.service.js';

export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  create = (ctx: Ctx) => this.announcements.create(mustTenant(ctx), ctx.body as CreateAnnouncementRequest);

  listRecent = (ctx: Ctx) => this.announcements.listRecent(mustTenant(ctx));

  getById = (ctx: Ctx) => this.announcements.getById(mustTenant(ctx), ctx.params['announcementId'] ?? '');
}
