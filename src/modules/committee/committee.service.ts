import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleCommitteeMemberRepository } from '../../infrastructure/repositories/oracle/oracle-committee-member.repository.js';
import type { CommitteeMemberRecord } from './ports/committee-member.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateCommitteeMemberRequest } from './committee.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

export class CommitteeService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleCommitteeMemberRepository {
    return new OracleCommitteeMemberRepository(this.pool, ctx);
  }

  async create(ctx: TenantContext, input: CreateCommitteeMemberRequest): Promise<CommitteeMemberRecord> {
    return this.#repo(ctx).create({ id: uuidv7(), ...input, createdBy: ctx.userId });
  }

  async listActive(ctx: TenantContext): Promise<CommitteeMemberRecord[]> {
    return this.#repo(ctx).listActive();
  }

  async getById(ctx: TenantContext, id: string): Promise<CommitteeMemberRecord> {
    const member = await this.#repo(ctx).findById(id);
    if (!member) throw new AppError('NOT_FOUND', `Committee member ${id} not found`);
    return member;
  }
}
