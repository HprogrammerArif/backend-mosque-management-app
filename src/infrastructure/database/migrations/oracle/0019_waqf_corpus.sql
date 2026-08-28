-- BR-2: a WAQF fund's corpus is inalienable — expenses may draw only against income
-- recorded above this floor, never below it. CORPUS_MINOR is 0 (no protection) for every
-- non-WAQF fund; nothing stops an Admin setting it on another fund type, but nothing
-- reads it there either — the check in ExpensesService only applies to type = 'WAQF'.
--
-- Nullable, no NOT NULL/DEFAULT: FUNDS is VPD-protected and already has rows from every
-- previously-provisioned mosque. A NOT NULL DEFAULT would need Oracle to backfill those
-- existing rows, which requires a tenant context the migrator never sets (it runs
-- unscoped) — the exact ORA-28133 hit during Phase 2A's sync-engine migration. The
-- repository maps NULL to 0 at read time instead (same trick FUNDS.CORPUS_MINOR's
-- consumer, ExpensesService, would need regardless).
ALTER TABLE FUNDS ADD CORPUS_MINOR NUMBER(18)
;
