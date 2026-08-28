import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleFundRepository } from '../../infrastructure/repositories/oracle/oracle-fund.repository.js';
import type { FundRecord } from './ports/fund.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { SetFundCorpusRequest } from './funds.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

export class FundsService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleFundRepository {
    return new OracleFundRepository(this.pool, ctx);
  }

  async listMine(ctx: TenantContext): Promise<FundRecord[]> {
    return this.#repo(ctx).listMine();
  }

  /**
   * BR-2's corpus-adjustment entry. Admin-only and reason-required are enforced above
   * this (route role guard, schema), not here — this layer's own job is refusing the
   * one thing that would make the whole rule meaningless: setting a corpus on a fund
   * that isn't WAQF, where ExpensesService's check never even looks at it.
   *
   * **Named gap**: the domain doc calls for this "appearing in the audit log" — no
   * audit-log table exists yet anywhere in this codebase (not specific to BR-2), so the
   * reason is validated and logged rather than durably persisted. Same honesty as
   * AnnouncementsService's #notifyUrgent stub.
   */
  async setCorpus(ctx: TenantContext, fundId: string, request: SetFundCorpusRequest): Promise<FundRecord> {
    const repo = this.#repo(ctx);
    const fund = await repo.findById(fundId);
    if (!fund) throw new AppError('NOT_FOUND', `Fund ${fundId} not found`);
    if (fund.type !== 'WAQF') {
      throw new AppError('VALIDATION_FAILED', 'Only a WAQF fund can have a protected corpus');
    }
    console.warn(
      `[funds] Corpus for WAQF fund ${fundId} (tenant ${ctx.tenantId}) set to ${request.corpusMinor} ` +
      `by ${ctx.userId}: ${request.reason}`,
    );
    return repo.setCorpus(fundId, request.corpusMinor);
  }
}
