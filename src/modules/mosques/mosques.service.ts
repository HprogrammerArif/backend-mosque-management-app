import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import type { OracleMosqueRepository } from '../../infrastructure/repositories/oracle/oracle-mosque.repository.js';
import type { OracleMembershipRepository } from '../../infrastructure/repositories/oracle/oracle-membership.repository.js';
import { OracleFundRepository } from '../../infrastructure/repositories/oracle/oracle-fund.repository.js';
import { OracleExpenseCategoryRepository } from '../../infrastructure/repositories/oracle/oracle-expense-category.repository.js';
import type { MosqueRecord } from './ports/mosque.repository.js';
import type { FundType } from '../../domain/enums.js';
import type { CreateMosqueRequest } from './mosques.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

/**
 * Seeded on every mosque, BR-1's zakat_eligible flag preset per fund — only the ZAKAT
 * fund carries it; BR-1 restricts disbursement from THIS flag, not from fund TYPE alone,
 * so it must be an explicit column rather than derived at read time.
 */
const DEFAULT_FUNDS: ReadonlyArray<{ type: FundType; name: string; zakatEligible: boolean }> = [
  { type: 'GENERAL', name: 'General', zakatEligible: false },
  { type: 'ZAKAT', name: 'Zakat', zakatEligible: true },
  { type: 'SADAQAH', name: 'Sadaqah', zakatEligible: false },
  { type: 'LILLAH', name: 'Lillah', zakatEligible: false },
  { type: 'FITRANA', name: 'Fitrana', zakatEligible: false },
  { type: 'QURBANI', name: 'Qurbani', zakatEligible: false },
  { type: 'WAQF', name: 'Waqf', zakatEligible: false },
  { type: 'BUILDING', name: 'Building', zakatEligible: false },
];

/**
 * BR-1's other anchor — an expense can only draw from the Zakat fund if its own
 * category is also zakat-eligible. Only one zakat-eligible category is seeded (most
 * South Asian mosques' zakat distribution is overwhelmingly to the poor/needy); admins
 * add the other seven asnaf categories only if they actually need that granularity.
 */
const DEFAULT_EXPENSE_CATEGORIES: ReadonlyArray<
  { name: string; zakatEligible: boolean; asnafCategory: 'FUQARA' | null }
> = [
  { name: 'General Expenses', zakatEligible: false, asnafCategory: null },
  { name: 'Utilities', zakatEligible: false, asnafCategory: null },
  { name: 'Maintenance', zakatEligible: false, asnafCategory: null },
  { name: 'Salaries', zakatEligible: false, asnafCategory: null },
  { name: 'Zakat Distribution', zakatEligible: true, asnafCategory: 'FUQARA' },
];

export class MosquesService {
  constructor(
    private readonly pool: OraclePool,
    private readonly mosques: OracleMosqueRepository,
    private readonly memberships: OracleMembershipRepository,
  ) {}

  /**
   * Either completes or leaves nothing behind (tenant-lifecycle doc). Depends on the
   * CONCRETE Oracle repositories, not their ports, for the `tx`-aware `create()` — the
   * one deliberate ADR-0002 exception named in Task 2's finding: atomicity across three
   * tables is shaped by the Oracle transaction primitive in a way the port abstraction
   * was never trying to hide.
   */
  async create(userId: string, input: CreateMosqueRequest): Promise<MosqueRecord> {
    const mosqueId = uuidv7();
    const ctx = { tenantId: mosqueId, userId, role: 'ADMIN' as const };
    const funds = new OracleFundRepository(this.pool, ctx);
    const expenseCategories = new OracleExpenseCategoryRepository(this.pool, ctx);

    return this.pool.withTenantTransaction(mosqueId, async (tx) => {
      const mosque = await this.mosques.create(
        { id: mosqueId, ...input, status: 'ACTIVE' },
        tx,
      );
      await this.memberships.create({ id: uuidv7(), mosqueId, userId, role: 'ADMIN' }, tx);
      for (const fund of DEFAULT_FUNDS) {
        await funds.insert({ id: uuidv7(), ...fund }, tx);
      }
      for (const category of DEFAULT_EXPENSE_CATEGORIES) {
        await expenseCategories.insert({ id: uuidv7(), ...category, isSystem: true }, tx);
      }
      return mosque;
    });
  }

  async getById(id: string): Promise<MosqueRecord> {
    const mosque = await this.mosques.findById(id);
    if (!mosque) throw new AppError('TENANT_NOT_FOUND', `Mosque ${id} not found`);
    return mosque;
  }

  async listMine(userId: string): Promise<MosqueRecord[]> {
    return this.mosques.listByUser(userId);
  }
}
