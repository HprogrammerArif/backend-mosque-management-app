import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleHouseholdRepository } from '../../infrastructure/repositories/oracle/oracle-household.repository.js';
import type { HouseholdRecord } from './ports/household.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateHouseholdRequest } from './households.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

export class HouseholdsService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleHouseholdRepository {
    return new OracleHouseholdRepository(this.pool, ctx);
  }

  async create(ctx: TenantContext, input: CreateHouseholdRequest): Promise<HouseholdRecord> {
    return this.#repo(ctx).create({ id: uuidv7(), ...input, createdBy: ctx.userId });
  }

  async listActive(ctx: TenantContext): Promise<HouseholdRecord[]> {
    return this.#repo(ctx).listActive();
  }

  async getById(ctx: TenantContext, id: string): Promise<HouseholdRecord> {
    const household = await this.#repo(ctx).findById(id);
    if (!household) throw new AppError('NOT_FOUND', `Household ${id} not found`);
    return household;
  }
}
