import { uuidv7 } from 'uuidv7';
import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleDuesChargeRepository } from '../../infrastructure/repositories/oracle/oracle-dues-charge.repository.js';
import { OracleDuesPaymentRepository } from '../../infrastructure/repositories/oracle/oracle-dues-payment.repository.js';
import { OracleHouseholdRepository } from '../../infrastructure/repositories/oracle/oracle-household.repository.js';
import type { DuesChargeRecord } from './ports/dues-charge.repository.js';
import type { DuesPaymentRecord } from './ports/dues-payment.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { RecordDuesPaymentRequest } from './dues.schemas.js';
import { AppError } from '../../common/errors/app-error.js';

/** Last calendar day of a "YYYY-MM" period, as "YYYY-MM-DD" — dues fall due at month end. */
function periodDueDate(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(lastDay).padStart(2, '0')}`;
}

export class DuesService {
  constructor(private readonly pool: OraclePool) {}

  #charges(ctx: TenantContext): OracleDuesChargeRepository {
    return new OracleDuesChargeRepository(this.pool, ctx);
  }

  #payments(ctx: TenantContext): OracleDuesPaymentRepository {
    return new OracleDuesPaymentRepository(this.pool, ctx);
  }

  #households(ctx: TenantContext): OracleHouseholdRepository {
    return new OracleHouseholdRepository(this.pool, ctx);
  }

  /**
   * Creates a DUES_CHARGE for every active, non-exempt household with a nonzero
   * monthlyDuesMinor. Idempotent per (household, period) — UX_DC_PERIOD is the real
   * guard, but checking first avoids a noisy failed-insert round trip on re-runs.
   */
  async generateForPeriod(ctx: TenantContext, period: string): Promise<DuesChargeRecord[]> {
    const charges = this.#charges(ctx);
    const households = await this.#households(ctx).listActive();
    const dueOn = periodDueDate(period);
    const created: DuesChargeRecord[] = [];

    for (const household of households) {
      if (household.exempt || household.monthlyDuesMinor <= 0) continue;
      const existing = await charges.findByHouseholdAndPeriod(household.id, period);
      if (existing) continue;

      created.push(await charges.create({
        id: uuidv7(),
        householdId: household.id,
        period,
        amountMinor: household.monthlyDuesMinor,
        currency: 'BDT',
        dueOn,
        createdBy: ctx.userId,
      }));
    }

    return created;
  }

  async listByPeriod(ctx: TenantContext, period: string): Promise<DuesChargeRecord[]> {
    return this.#charges(ctx).listByPeriod(period);
  }

  async listByHousehold(ctx: TenantContext, householdId: string): Promise<DuesChargeRecord[]> {
    return this.#charges(ctx).listByHousehold(householdId);
  }

  async getById(ctx: TenantContext, id: string): Promise<DuesChargeRecord> {
    const charge = await this.#charges(ctx).findById(id);
    if (!charge) throw new AppError('NOT_FOUND', `Dues charge ${id} not found`);
    return charge;
  }

  async listPayments(ctx: TenantContext, chargeId: string): Promise<DuesPaymentRecord[]> {
    await this.getById(ctx, chargeId);
    return this.#payments(ctx).listByCharge(chargeId);
  }

  /**
   * Payment insert and the charge's PAID_MINOR/STATUS recompute happen in one
   * transaction — a payment that "landed" but never moved the charge's balance (or vice
   * versa) is exactly the kind of split-write DUES_PAYMENTS' append-only trigger can't
   * catch on its own.
   */
  async recordPayment(
    ctx: TenantContext, chargeId: string, input: RecordDuesPaymentRequest,
  ): Promise<DuesPaymentRecord> {
    const charge = await this.getById(ctx, chargeId);
    if (charge.status === 'PAID' || charge.status === 'WAIVED') {
      throw new AppError('RULE_DUES_ALREADY_SETTLED', `Dues charge ${chargeId} is already ${charge.status.toLowerCase()}`);
    }
    const remainingMinor = charge.amountMinor - charge.paidMinor;
    if (input.amountMinor > remainingMinor) {
      throw new AppError(
        'RULE_DUES_OVERPAYMENT',
        `Payment of ${input.amountMinor} exceeds the ${remainingMinor} remaining on charge ${chargeId}`,
      );
    }

    const paymentsRepo = this.#payments(ctx);
    const chargesRepo = this.#charges(ctx);
    const payment = { id: uuidv7(), chargeId, ...input, createdBy: ctx.userId };

    return this.pool.withTenantTransaction(ctx.tenantId, async (tx) => {
      const created = await paymentsRepo.create(payment, tx);
      await chargesRepo.applyPayment(chargeId, input.amountMinor, tx);
      return created;
    });
  }

  async waiveCharge(ctx: TenantContext, chargeId: string, reason: string): Promise<DuesChargeRecord> {
    const charge = await this.getById(ctx, chargeId);
    if (charge.status === 'PAID' || charge.status === 'WAIVED') {
      throw new AppError('RULE_DUES_ALREADY_SETTLED', `Dues charge ${chargeId} is already ${charge.status.toLowerCase()}`);
    }
    await this.#charges(ctx).waive(chargeId, ctx.userId, reason);
    return this.getById(ctx, chargeId);
  }
}
