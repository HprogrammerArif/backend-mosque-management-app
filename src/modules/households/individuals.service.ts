import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleIndividualRepository } from '../../infrastructure/repositories/oracle/oracle-individual.repository.js';
import type { IndividualRecord } from './ports/individual.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateIndividualRequest } from './individuals.schemas.js';

export class IndividualsService {
  constructor(private readonly pool: OraclePool) {}

  async listByHousehold(ctx: TenantContext, householdId: string): Promise<IndividualRecord[]> {
    return new OracleIndividualRepository(this.pool, ctx).listByHousehold(householdId);
  }

  async create(
    ctx: TenantContext, householdId: string, input: CreateIndividualRequest,
  ): Promise<IndividualRecord> {
    return new OracleIndividualRepository(this.pool, ctx).create({
      id: uuidv7(), householdId, ...input, createdBy: ctx.userId,
    });
  }
}
