import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleEventRepository } from '../../infrastructure/repositories/oracle/oracle-event.repository.js';
import type { EventRecord } from './ports/event.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateEventRequest } from './events.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

const DEFAULT_LIST_LIMIT = 50;

export class EventsService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleEventRepository {
    return new OracleEventRepository(this.pool, ctx);
  }

  async create(ctx: TenantContext, input: CreateEventRequest): Promise<EventRecord> {
    return this.#repo(ctx).create({ id: uuidv7(), ...input, createdBy: ctx.userId });
  }

  async listUpcoming(ctx: TenantContext, limit = DEFAULT_LIST_LIMIT): Promise<EventRecord[]> {
    return this.#repo(ctx).listUpcoming(limit);
  }

  async getById(ctx: TenantContext, id: string): Promise<EventRecord> {
    const event = await this.#repo(ctx).findById(id);
    if (!event) throw new AppError('NOT_FOUND', `Event ${id} not found`);
    return event;
  }
}
