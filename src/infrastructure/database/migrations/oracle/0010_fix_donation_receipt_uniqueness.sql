-- Found live: Oracle's composite UNIQUE (TENANT_ID, RECEIPT_NO) treats two rows with
-- the same TENANT_ID and a NULL RECEIPT_NO as duplicates — unlike Postgres/ANSI, where
-- any NULL in a composite key makes the row distinct. Oracle only excludes a row from a
-- unique index when EVERY indexed column is NULL. A second donation with no receipt
-- number (the common case — receipts are optional, FR-DON-7 is a "should") failed with
-- ORA-00001 the moment it existed.
--
-- Standard Oracle idiom: rewrite as a function-based unique index where TENANT_ID
-- itself evaluates to NULL whenever RECEIPT_NO is NULL, so both indexed expressions go
-- NULL together and Oracle excludes the row entirely, restoring "unique only when a
-- receipt number is actually given."
ALTER TABLE DONATIONS DROP CONSTRAINT UX_DON_RECEIPT
;
CREATE UNIQUE INDEX UX_DON_RECEIPT ON DONATIONS(
  CASE WHEN RECEIPT_NO IS NULL THEN NULL ELSE TENANT_ID END,
  RECEIPT_NO
)
;
