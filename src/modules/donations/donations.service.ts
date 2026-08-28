import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleDonationRepository } from '../../infrastructure/repositories/oracle/oracle-donation.repository.js';
import type { DonationRecord, FundBalance } from './ports/donation.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { CreateDonationRequest } from './donations.schemas.js';
import { negateMoney, type Currency } from '../../domain/money.js';
import { AppError } from '../../common/errors/app-error.js';

const DEFAULT_LIST_LIMIT = 50;

export class DonationsService {
  constructor(private readonly pool: OraclePool) {}

  #repo(ctx: TenantContext): OracleDonationRepository {
    return new OracleDonationRepository(this.pool, ctx);
  }

  async record(ctx: TenantContext, input: CreateDonationRequest): Promise<DonationRecord> {
    return this.#repo(ctx).create({
      id: uuidv7(),
      ...input,
      adjustsId: null,
      adjustmentReason: null,
      createdBy: ctx.userId,
    });
  }

  async getById(ctx: TenantContext, id: string): Promise<DonationRecord> {
    const donation = await this.#repo(ctx).findById(id);
    if (!donation) throw new AppError('NOT_FOUND', `Donation ${id} not found`);
    return donation;
  }

  async listRecent(ctx: TenantContext, limit = DEFAULT_LIST_LIMIT): Promise<DonationRecord[]> {
    return this.#repo(ctx).listRecent(limit);
  }

  async listByFund(ctx: TenantContext, fundId: string, limit = DEFAULT_LIST_LIMIT): Promise<DonationRecord[]> {
    return this.#repo(ctx).listByFund(fundId, limit);
  }

  async balanceByFund(ctx: TenantContext): Promise<FundBalance[]> {
    return this.#repo(ctx).balanceByFund();
  }

  /**
   * FR-DON-4: donations are append-only (DONATIONS also has a DB trigger blocking
   * UPDATE). A correction is a new row negating the original's amount, linked via
   * adjustsId — the balance query already sums every row, so the negation nets out
   * without ever mutating history.
   */
  async adjust(ctx: TenantContext, originalId: string, reason: string): Promise<DonationRecord> {
    const repo = this.#repo(ctx);
    const original = await repo.findById(originalId);
    if (!original) throw new AppError('NOT_FOUND', `Donation ${originalId} not found`);

    const negated = negateMoney({ amountMinor: original.amountMinor, currency: original.currency as Currency });

    return repo.create({
      id: uuidv7(),
      fundId: original.fundId,
      amountMinor: negated.amountMinor,
      currency: negated.currency,
      occurredOn: original.occurredOn,
      method: original.method,
      donorHouseholdId: original.donorHouseholdId,
      donorName: original.donorName,
      anonymous: original.anonymous,
      receiptNo: null,
      note: original.note,
      adjustsId: original.id,
      adjustmentReason: reason,
      createdBy: ctx.userId,
    });
  }
}
