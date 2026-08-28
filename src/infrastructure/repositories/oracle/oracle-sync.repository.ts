import type { OraclePool, Tx, Binds } from '../../database/oracle.pool.js';

export type DonationRow = {
  id: string; fund_id: string; amount_minor: number; currency: string;
  occurred_on: Date; method: string; donor_household_id: string | null;
  donor_name: string | null; anonymous: number; receipt_no: string | null;
  note: string | null; adjusts_id: string | null; adjustment_reason: string | null;
  created_by: string; created_at: Date;
  server_version: number | null; change_seq: number | null; hlc: string | null;
  mutation_id: string | null;
};

export type HouseholdRow = {
  id: string; name: string; head_individual_id: string | null;
  address_line1: string | null; area: string | null; phone: string | null;
  monthly_dues_minor: number; collector_user_id: string | null;
  exempt: number; joined_on: Date | null; status: string;
  server_version: number | null; change_seq: number | null; hlc: string | null;
  mutation_id: string | null; field_clocks: string | null; deleted_at: Date | null;
};

const DONATION_COLUMNS = `ID, FUND_ID, AMOUNT_MINOR, CURRENCY, OCCURRED_ON, METHOD,
  DONOR_HOUSEHOLD_ID, DONOR_NAME, ANONYMOUS, RECEIPT_NO, NOTE, ADJUSTS_ID, ADJUSTMENT_REASON,
  CREATED_BY, CREATED_AT, SERVER_VERSION, CHANGE_SEQ, HLC, MUTATION_ID`;

const HOUSEHOLD_COLUMNS = `ID, NAME, HEAD_INDIVIDUAL_ID, ADDRESS_LINE1, AREA, PHONE,
  MONTHLY_DUES_MINOR, COLLECTOR_USER_ID, EXEMPT, JOINED_ON, STATUS,
  SERVER_VERSION, CHANGE_SEQ, HLC, MUTATION_ID, FIELD_CLOCKS, DELETED_AT`;

/**
 * Raw SQL for the sync engine specifically — deliberately separate from
 * OracleDonationRepository/OracleHouseholdRepository (the REST-facing repositories),
 * which don't touch the sync metadata columns at all. Merging the two would mean every
 * REST call site also has to reason about change_seq/hlc/mutation_id; keeping them apart
 * means a REST-created row simply has NULL sync metadata ("never synced"), exactly the
 * semantics migration 0011 was designed around.
 */
export class OracleSyncRepository {
  constructor(private readonly pool: OraclePool) {}

  async nextChangeSeq(tx: Tx): Promise<number> {
    const rows = await tx.execute<{ next_val: number }>('SELECT SEQ_CHANGE.NEXTVAL AS NEXT_VAL FROM DUAL');
    const value = rows[0]?.next_val;
    if (value === undefined) throw new Error('SEQ_CHANGE.NEXTVAL returned no row');
    return Number(value);
  }

  async writeChangeLog(
    tx: Tx, tenantId: string, entity: string, entityId: string, op: string, changeSeq: number,
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO CHANGE_LOG (CHANGE_SEQ, TENANT_ID, ENTITY, ENTITY_ID, OP)
       VALUES (:changeSeq, :tenantId, :entity, :entityId, :op)`,
      { changeSeq, tenantId, entity, entityId, op },
    );
  }

  // ── donations (immutable ledger — insert only, dedup by mutation_id) ──────────────

  async findDonationByMutationId(tx: Tx, mutationId: string): Promise<DonationRow | null> {
    const rows = await tx.execute<DonationRow>(
      `SELECT ${DONATION_COLUMNS} FROM DONATIONS WHERE MUTATION_ID = :mutationId`,
      { mutationId },
    );
    return rows[0] ?? null;
  }

  async insertDonationSynced(
    tx: Tx, tenantId: string, createdBy: string,
    input: Omit<DonationRow, 'created_by' | 'created_at' | 'server_version' | 'occurred_on' | 'change_seq' | 'hlc' | 'mutation_id'>
      & { occurred_on: string; changeSeq: number; hlc: string; mutationId: string },
  ): Promise<void> {
    const binds: Binds = {
      id: input.id, tenantId, fundId: input.fund_id, amountMinor: input.amount_minor,
      currency: input.currency, occurredOn: new Date(input.occurred_on), method: input.method,
      donorHouseholdId: input.donor_household_id, donorName: input.donor_name,
      anonymous: input.anonymous, receiptNo: input.receipt_no, note: input.note,
      adjustsId: input.adjusts_id, adjustmentReason: input.adjustment_reason, createdBy,
      serverVersion: 1, changeSeq: input.changeSeq, hlc: input.hlc, mutationId: input.mutationId,
    };
    await tx.execute(
      `INSERT INTO DONATIONS (
         ID, TENANT_ID, FUND_ID, AMOUNT_MINOR, CURRENCY, OCCURRED_ON, METHOD,
         DONOR_HOUSEHOLD_ID, DONOR_NAME, ANONYMOUS, RECEIPT_NO, NOTE,
         ADJUSTS_ID, ADJUSTMENT_REASON, CREATED_BY, SERVER_VERSION, CHANGE_SEQ, HLC, MUTATION_ID
       ) VALUES (
         :id, :tenantId, :fundId, :amountMinor, :currency, :occurredOn, :method,
         :donorHouseholdId, :donorName, :anonymous, :receiptNo, :note,
         :adjustsId, :adjustmentReason, :createdBy, :serverVersion, :changeSeq, :hlc, :mutationId
       )`,
      binds,
    );
  }

  async pullDonations(tenantId: string, since: number, maxSeq: number, limit: number): Promise<DonationRow[]> {
    return this.pool.executeAsTenant<DonationRow>(
      tenantId,
      `SELECT ${DONATION_COLUMNS} FROM DONATIONS
        WHERE TENANT_ID = :tenantId AND CHANGE_SEQ > :since AND CHANGE_SEQ <= :maxSeq
        ORDER BY CHANGE_SEQ FETCH FIRST :limit ROWS ONLY`,
      { tenantId, since, maxSeq, limit },
    );
  }

  async bootstrapDonations(tenantId: string, limit: number, offset: number): Promise<DonationRow[]> {
    return this.pool.executeAsTenant<DonationRow>(
      tenantId,
      `SELECT ${DONATION_COLUMNS} FROM DONATIONS
        WHERE TENANT_ID = :tenantId
        ORDER BY CREATED_AT
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { tenantId, offset, limit },
    );
  }

  // ── households (field-merge — insert or update) ────────────────────────────────

  async findHouseholdById(tx: Tx, id: string): Promise<HouseholdRow | null> {
    const rows = await tx.execute<HouseholdRow>(
      `SELECT ${HOUSEHOLD_COLUMNS} FROM HOUSEHOLDS WHERE ID = :id`, { id },
    );
    return rows[0] ?? null;
  }

  async findHouseholdByMutationId(tx: Tx, mutationId: string): Promise<HouseholdRow | null> {
    const rows = await tx.execute<HouseholdRow>(
      `SELECT ${HOUSEHOLD_COLUMNS} FROM HOUSEHOLDS WHERE MUTATION_ID = :mutationId`, { mutationId },
    );
    return rows[0] ?? null;
  }

  async insertHouseholdSynced(
    tx: Tx, tenantId: string, createdBy: string,
    input: Omit<HouseholdRow, 'server_version' | 'deleted_at' | 'joined_on' | 'change_seq' | 'hlc' | 'mutation_id' | 'field_clocks'>
      & { joined_on: string | null; changeSeq: number; hlc: string; mutationId: string; fieldClocksJson: string },
  ): Promise<void> {
    await tx.execute(
      `INSERT INTO HOUSEHOLDS (
         ID, TENANT_ID, NAME, ADDRESS_LINE1, AREA, PHONE, MONTHLY_DUES_MINOR, EXEMPT, JOINED_ON,
         CREATED_BY, SERVER_VERSION, CHANGE_SEQ, HLC, MUTATION_ID, FIELD_CLOCKS
       ) VALUES (
         :id, :tenantId, :name, :addressLine1, :area, :phone, :monthlyDuesMinor, :exempt, :joinedOn,
         :createdBy, 1, :changeSeq, :hlc, :mutationId, :fieldClocksJson
       )`,
      {
        id: input.id, tenantId, name: input.name, addressLine1: input.address_line1,
        area: input.area, phone: input.phone, monthlyDuesMinor: input.monthly_dues_minor,
        exempt: input.exempt, joinedOn: input.joined_on === null ? null : new Date(input.joined_on),
        createdBy, changeSeq: input.changeSeq, hlc: input.hlc, mutationId: input.mutationId,
        fieldClocksJson: input.fieldClocksJson,
      },
    );
  }

  /**
   * Writes the field-merge OUTCOME the service already computed — every mutable column
   * gets set to its winning value (the incoming write's or the row's own current one),
   * never a partial/dynamic SET clause. FIELD_CLOCKS is the full post-merge map, not a
   * delta. No append-only trigger on HOUSEHOLDS (unlike DONATIONS/EXPENSES) — it's a
   * mutable registry entity by design, matching SYNC_ENTITIES' 'field_merge' policy.
   *
   * `NVL(SERVER_VERSION, 0) + 1`, not a plain `+ 1`: a household created via the REST
   * API (never synced) has SERVER_VERSION = NULL — migration 0011's "never synced"
   * signal — and Oracle arithmetic on NULL yields NULL, which would leave it NULL
   * forever instead of correctly becoming 1 on its first sync-visible write.
   */
  async updateHouseholdMerged(
    tx: Tx, id: string,
    input: {
      name: string; address_line1: string | null; area: string | null; phone: string | null;
      monthly_dues_minor: number; exempt: number; joined_on: string | null;
      changeSeq: number; hlc: string; mutationId: string; fieldClocksJson: string;
    },
  ): Promise<void> {
    await tx.execute(
      `UPDATE HOUSEHOLDS SET
         NAME = :name, ADDRESS_LINE1 = :addressLine1, AREA = :area, PHONE = :phone,
         MONTHLY_DUES_MINOR = :monthlyDuesMinor, EXEMPT = :exempt, JOINED_ON = :joinedOn,
         SERVER_VERSION = NVL(SERVER_VERSION, 0) + 1,
         CHANGE_SEQ = :changeSeq, HLC = :hlc, MUTATION_ID = :mutationId, FIELD_CLOCKS = :fieldClocksJson
       WHERE ID = :id`,
      {
        id, name: input.name, addressLine1: input.address_line1, area: input.area, phone: input.phone,
        monthlyDuesMinor: input.monthly_dues_minor, exempt: input.exempt,
        joinedOn: input.joined_on === null ? null : new Date(input.joined_on),
        changeSeq: input.changeSeq, hlc: input.hlc, mutationId: input.mutationId,
        fieldClocksJson: input.fieldClocksJson,
      },
    );
  }

  async pullHouseholds(tenantId: string, since: number, maxSeq: number, limit: number): Promise<HouseholdRow[]> {
    return this.pool.executeAsTenant<HouseholdRow>(
      tenantId,
      `SELECT ${HOUSEHOLD_COLUMNS} FROM HOUSEHOLDS
        WHERE TENANT_ID = :tenantId AND CHANGE_SEQ > :since AND CHANGE_SEQ <= :maxSeq
        ORDER BY CHANGE_SEQ FETCH FIRST :limit ROWS ONLY`,
      { tenantId, since, maxSeq, limit },
    );
  }

  async bootstrapHouseholds(tenantId: string, limit: number, offset: number): Promise<HouseholdRow[]> {
    return this.pool.executeAsTenant<HouseholdRow>(
      tenantId,
      `SELECT ${HOUSEHOLD_COLUMNS} FROM HOUSEHOLDS
        WHERE TENANT_ID = :tenantId
        ORDER BY CREATED_AT
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
      { tenantId, offset, limit },
    );
  }

  // ── shared ──────────────────────────────────────────────────────────────────────

  /**
   * Highest change_seq value that is safe to return — see the pull safety-lag note.
   * Scoped to the tenant (via executeAsTenant), not global. SEQ_CHANGE is a shared
   * sequence, but a gap caused by a DIFFERENT tenant's transaction committing out of
   * order doesn't affect what THIS tenant's client needs to see — it only ever pulls
   * its own CHANGE_LOG rows anyway. Scoping also happens to be required for a more
   * mundane reason: CHANGE_LOG is VPD-protected, and a plain pool.execute() with no
   * tenant context set gets silently filtered to zero rows (fail-closed), which made
   * this return 0 unconditionally — every pull looked like there was nothing to sync.
   */
  async maxSafeChangeSeq(tenantId: string): Promise<number> {
    const rows = await this.pool.executeAsTenant<{ max_seq: number | null }>(
      tenantId,
      `SELECT MAX(CHANGE_SEQ) AS MAX_SEQ FROM CHANGE_LOG
        WHERE TENANT_ID = :tenantId AND CREATED_AT <= SYSTIMESTAMP - INTERVAL '1' SECOND`,
      { tenantId },
    );
    return Number(rows[0]?.max_seq ?? 0);
  }
}
