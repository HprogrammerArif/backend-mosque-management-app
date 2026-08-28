import type { Ctx } from '../../http/types.js';
import { mustTenant } from '../../http/context.js';
import type { CreateEventRequest } from './events.schemas.js';
import type { EventsService } from './events.service.js';

export class EventsController {
  constructor(private readonly events: EventsService) {}

  create = (ctx: Ctx) => this.events.create(mustTenant(ctx), ctx.body as CreateEventRequest);

  listUpcoming = (ctx: Ctx) => this.events.listUpcoming(mustTenant(ctx));

  getById = (ctx: Ctx) => this.events.getById(mustTenant(ctx), ctx.params['eventId'] ?? '');
}
