import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleExpenseCategoryRepository } from '../../infrastructure/repositories/oracle/oracle-expense-category.repository.js';
import type { ExpenseCategoryRecord } from './ports/expense-category.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateExpenseCategoryRequest } from './expense-categories.schemas.js';

export class ExpenseCategoriesService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleExpenseCategoryRepository {
    return new OracleExpenseCategoryRepository(this.pool, ctx);
  }

  async listAll(ctx: TenantContext): Promise<ExpenseCategoryRecord[]> {
    return this.#repo(ctx).listAll();
  }

  async create(ctx: TenantContext, input: CreateExpenseCategoryRequest): Promise<ExpenseCategoryRecord> {
    return this.#repo(ctx).insert({ id: uuidv7(), ...input, isSystem: false });
  }
}
