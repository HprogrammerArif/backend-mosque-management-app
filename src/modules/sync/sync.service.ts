import type { OraclePool } from '../../infrastructure/database/oracle.pool.js';
import { OracleSyncRepository } from '../../infrastructure/repositories/oracle/oracle-sync.repository.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type {
  BootstrapRequest, PushRequest, Mutation, SyncEntity, DonationPayload, HouseholdPayload,
} from './sync.schemas.js';
import { serializeHlc, type Hlc } from '../../domain/hlc.js';

const BOOTSTRAP_PAGE_SIZE = 500;
const PULL_PAGE_SIZE = 500;

export type MutationResult =
  | { mutationId: string; status: 'accepted'; serverVersion: number; changeSeq: number; canonical: unknown }
  | { mutationId: string; status: 'duplicate'; serverVersion: number; changeSeq: number; canonical: unknown }
  | { mutationId: string; status: 'rejected'; code: string; message: string };

function donationToCanonical(row: Awaited<ReturnType<OracleSyncRepository['findDonationByMutationId']>>) {
  if (!row) return null;
  return {
    id: row.id, fundId: row.fund_id, amountMinor: Number(row.amount_minor), currency: row.currency,
    occurredOn: row.occurred_on.toISOString().slice(0, 10), method: row.method,
    donorHouseholdId: row.donor_household_id, donorName: row.donor_name,
    anonymous: Number(row.anonymous) === 1, receiptNo: row.receipt_no, note: row.note,
    adjustsId: row.adjusts_id, adjustmentReason: row.adjustment_reason,
  };
}

function householdToCanonical(row: Awaited<ReturnType<OracleSyncRepository['findHouseholdByMutationId']>>) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, addressLine1: row.address_line1, area: row.area, phone: row.phone,
    monthlyDuesMinor: Number(row.monthly_dues_minor), exempt: Number(row.exempt) === 1,
    joinedOn: row.joined_on === null ? null : row.joined_on.toISOString().slice(0, 10),
    status: row.status,
  };
}

export class SyncService {
  constructor(private readonly pool: OraclePool) {}

  #repo(): OracleSyncRepository {
    return new OracleSyncRepository(this.pool);
  }

  async bootstrap(ctx: TenantContext, request: BootstrapRequest) {
    const repo = this.#repo();
    const entities: Record<string, unknown> = {};

    for (const entity of request.entities) {
      if (entity === 'donations') {
        const rows = await repo.bootstrapDonations(ctx.tenantId, BOOTSTRAP_PAGE_SIZE, 0);
        entities[entity] = {
          rows: rows.map((r) => donationToCanonical(r)),
          nextPage: null, cursor: Math.max(0, ...rows.map((r) => r.change_seq ?? 0)), complete: true,
        };
      } else if (entity === 'households') {
        const rows = await repo.bootstrapHouseholds(ctx.tenantId, BOOTSTRAP_PAGE_SIZE, 0);
        entities[entity] = {
          rows: rows.map((r) => householdToCanonical(r)),
          nextPage: null, cursor: Math.max(0, ...rows.map((r) => r.change_seq ?? 0)), complete: true,
        };
      }
    }

    return { serverTime: new Date().toISOString(), entities };
  }

  async push(ctx: TenantContext, request: PushRequest): Promise<{ results: MutationResult[]; cursor: number }> {
    const repo = this.#repo();
    const results: MutationResult[] = [];
    // Tracks entityIds successfully created earlier in THIS batch, so a mutation that
    // depends on a sibling mutation in the same push (e.g. a donation referencing a
    // household created moments earlier, offline) doesn't need that sibling to already
    // exist in the database — only to have already been applied in this loop.
    const appliedThisBatch = new Set<string>();
    let lastChangeSeq = 0;

    for (const mutation of request.mutations) {
      const result = await this.#applyOne(ctx, repo, mutation, appliedThisBatch);
      results.push(result);
      if (result.status === 'accepted' || result.status === 'duplicate') {
        appliedThisBatch.add(mutation.entityId);
        lastChangeSeq = Math.max(lastChangeSeq, result.changeSeq);
      }
    }

    return { results, cursor: lastChangeSeq };
  }

  async #applyOne(
    ctx: TenantContext, repo: OracleSyncRepository, mutation: Mutation, appliedThisBatch: Set<string>,
  ): Promise<MutationResult> {
    // Dependency check — the client's natural (UUIDv7-ordered) batch order is usually
    // already correct (offline-sync-protocol.md §7), so this validates rather than
    // topologically re-sorts: a genuinely missing parent is rejected, not silently
    // reordered.
    for (const dependencyId of mutation.dependsOn) {
      if (appliedThisBatch.has(dependencyId)) continue;
      // Households is the only entity a dependsOn reference can point at in this
      // two-entity scope — a donation created offline may depend on a household
      // created moments earlier in the same offline session; households have no
      // synced-entity dependencies of their own yet.
      const exists = await this.pool.executeAsTenant(
        ctx.tenantId, 'SELECT 1 FROM HOUSEHOLDS WHERE ID = :id', { id: dependencyId },
      );
      if (exists.length === 0) {
        return {
          mutationId: mutation.mutationId, status: 'rejected', code: 'SYNC_DEPENDENCY_NOT_FOUND',
          message: `Dependency ${dependencyId} not found`,
        };
      }
    }

    if (mutation.entity === 'donations') return this.#applyDonation(ctx, repo, mutation);
    return this.#applyHousehold(ctx, repo, mutation);
  }

  async #applyDonation(ctx: TenantContext, repo: OracleSyncRepository, mutation: Mutation): Promise<MutationResult> {
    if (mutation.op !== 'insert') {
      return {
        mutationId: mutation.mutationId, status: 'rejected', code: 'VALIDATION_FAILED',
        message: 'Donations are append-only — only insert is supported',
      };
    }
    const payload = mutation.payload as DonationPayload;

    return this.pool.withTenantTransaction(ctx.tenantId, async (tx) => {
      const existing = await repo.findDonationByMutationId(tx, mutation.mutationId);
      if (existing) {
        return {
          mutationId: mutation.mutationId, status: 'duplicate' as const,
          serverVersion: existing.server_version ?? 1, changeSeq: existing.change_seq ?? 0,
          canonical: donationToCanonical(existing),
        };
      }

      const changeSeq = await repo.nextChangeSeq(tx);
      await repo.insertDonationSynced(tx, ctx.tenantId, ctx.userId, {
        id: mutation.entityId, fund_id: payload.fundId, amount_minor: payload.amountMinor,
        currency: payload.currency, occurred_on: payload.occurredOn, method: payload.method,
        donor_household_id: payload.donorHouseholdId, donor_name: payload.donorName,
        anonymous: payload.anonymous ? 1 : 0, receipt_no: payload.receiptNo, note: payload.note,
        adjusts_id: payload.adjustsId, adjustment_reason: payload.adjustmentReason,
        changeSeq, hlc: mutation.hlc, mutationId: mutation.mutationId,
      });
      await repo.writeChangeLog(tx, ctx.tenantId, 'donations', mutation.entityId, 'insert', changeSeq);

      return {
        mutationId: mutation.mutationId, status: 'accepted' as const, serverVersion: 1, changeSeq,
        canonical: { id: mutation.entityId, ...payload },
      };
    });
  }

  async #applyHousehold(ctx: TenantContext, repo: OracleSyncRepository, mutation: Mutation): Promise<MutationResult> {
    if (mutation.op !== 'insert') {
      // Field-level LWW merge for updates (offline-sync-protocol.md §6.2) is a named,
      // deliberate gap — not yet built. Insert-only still exercises the whole push/pull/
      // bootstrap/dedup/HLC machinery end to end; merge is additive work on top of it,
      // not a prerequisite for it.
      return {
        mutationId: mutation.mutationId, status: 'rejected', code: 'VALIDATION_FAILED',
        message: 'Household updates via sync are not yet supported — field-merge is a known gap',
      };
    }
    const payload = mutation.payload as HouseholdPayload;

    return this.pool.withTenantTransaction(ctx.tenantId, async (tx) => {
      const existing = await repo.findHouseholdByMutationId(tx, mutation.mutationId);
      if (existing) {
        return {
          mutationId: mutation.mutationId, status: 'duplicate' as const,
          serverVersion: existing.server_version ?? 1, changeSeq: existing.change_seq ?? 0,
          canonical: householdToCanonical(existing),
        };
      }

      const changeSeq = await repo.nextChangeSeq(tx);
      const clock: Hlc = { wall: Date.now(), counter: 0, node: 'server' };
      const fieldClocksJson = JSON.stringify(Object.fromEntries(
        Object.keys(payload).map((field) => [field, serializeHlc(clock)]),
      ));
      await repo.insertHouseholdSynced(tx, ctx.tenantId, ctx.userId, {
        id: mutation.entityId, name: payload.name, head_individual_id: null,
        address_line1: payload.addressLine1, area: payload.area, phone: payload.phone,
        monthly_dues_minor: payload.monthlyDuesMinor, collector_user_id: null,
        exempt: payload.exempt ? 1 : 0, joined_on: payload.joinedOn, status: 'ACTIVE',
        changeSeq, hlc: mutation.hlc, mutationId: mutation.mutationId, fieldClocksJson,
      });
      await repo.writeChangeLog(tx, ctx.tenantId, 'households', mutation.entityId, 'insert', changeSeq);

      return {
        mutationId: mutation.mutationId, status: 'accepted' as const, serverVersion: 1, changeSeq,
        canonical: { id: mutation.entityId, ...payload, status: 'ACTIVE' },
      };
    });
  }

  async pull(ctx: TenantContext, entities: SyncEntity[], since: number, limit = PULL_PAGE_SIZE) {
    const repo = this.#repo();
    const maxSafe = await repo.maxSafeChangeSeq(ctx.tenantId);
    const changes: Record<string, unknown> = {};

    for (const entity of entities) {
      if (entity === 'donations') {
        const rows = await repo.pullDonations(ctx.tenantId, since, maxSafe, limit);
        const cursor = rows.length > 0 ? Math.max(...rows.map((r) => r.change_seq ?? since)) : since;
        changes[entity] = { rows: rows.map((r) => donationToCanonical(r)), cursor, hasMore: rows.length === limit };
      } else if (entity === 'households') {
        const rows = await repo.pullHouseholds(ctx.tenantId, since, maxSafe, limit);
        const cursor = rows.length > 0 ? Math.max(...rows.map((r) => r.change_seq ?? since)) : since;
        changes[entity] = { rows: rows.map((r) => householdToCanonical(r)), cursor, hasMore: rows.length === limit };
      }
    }

    return { changes, serverTime: new Date().toISOString() };
  }
}
