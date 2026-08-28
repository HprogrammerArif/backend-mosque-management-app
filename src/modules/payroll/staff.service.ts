import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleStaffRepository } from '../../infrastructure/repositories/oracle/oracle-staff.repository.js';
import type { StaffRecord } from './ports/staff.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateStaffRequest } from './payroll.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

export class StaffService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleStaffRepository {
    return new OracleStaffRepository(this.pool, ctx);
  }

  async create(ctx: TenantContext, input: CreateStaffRequest): Promise<StaffRecord> {
    return this.#repo(ctx).create({ id: uuidv7(), ...input, createdBy: ctx.userId });
  }

  async listActive(ctx: TenantContext): Promise<StaffRecord[]> {
    return this.#repo(ctx).listActive();
  }

  async getById(ctx: TenantContext, id: string): Promise<StaffRecord> {
    const staff = await this.#repo(ctx).findById(id);
    if (!staff) throw new AppError('NOT_FOUND', `Staff ${id} not found`);
    return staff;
  }
}
