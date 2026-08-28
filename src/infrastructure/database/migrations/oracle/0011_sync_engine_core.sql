-- Global monotonic sequence backing CHANGE_LOG.CHANGE_SEQ — deliberately one sequence
-- across all tenants (offline-sync-protocol.md §2.2): a sequence cursor, never a
-- timestamp, and TENANT_ID is a filter column on the pull query, not part of the
-- sequence itself.
CREATE SEQUENCE SEQ_CHANGE START WITH 1 INCREMENT BY 1 NOCACHE
;
CREATE TABLE CHANGE_LOG (
  CHANGE_SEQ  NUMBER(19)    NOT NULL,
  TENANT_ID   VARCHAR2(36)  NOT NULL,
  ENTITY      VARCHAR2(30)  NOT NULL,
  ENTITY_ID   VARCHAR2(36)  NOT NULL,
  OP          VARCHAR2(10)  NOT NULL,
  CREATED_AT  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT PK_CHANGE_LOG PRIMARY KEY (CHANGE_SEQ),
  CONSTRAINT FK_CL_TENANT FOREIGN KEY (TENANT_ID) REFERENCES MOSQUES(ID),
  CONSTRAINT CK_CL_OP CHECK (OP IN ('insert','update','delete'))
)
;
CREATE INDEX IX_CL_TENANT_ENTITY_SEQ ON CHANGE_LOG(TENANT_ID, ENTITY, CHANGE_SEQ)
;
-- Sync metadata retrofitted onto the two entities Plan 3 proves the engine against —
-- deliberately absent when these tables were first created (Money core predates the
-- sync engine on purpose). Columns are nullable, not NOT NULL DEFAULT: DONATIONS and
-- HOUSEHOLDS already hold rows, and an ALTER TABLE ADD of a NOT NULL DEFAULT column
-- requires Oracle to backfill every existing row — which, under a VPD policy with no
-- tenant context set (exactly the migrator's situation; it runs cross-tenant DDL, not
-- scoped to one tenant), fails outright with ORA-28133 ("full table access restricted").
-- A nullable ADD is pure metadata, touches no existing row, and is unaffected. Existing
-- pre-sync rows read back as NULL for these columns, which is the correct signal
-- ("never synced") — the application always sets them explicitly on write, so there is
-- no meaningful default to encode at the DB level anyway.
ALTER TABLE DONATIONS ADD (
  SERVER_VERSION  NUMBER(10),
  CHANGE_SEQ      NUMBER(19),
  HLC             VARCHAR2(64),
  MUTATION_ID     VARCHAR2(36)
)
;
-- Plain single-column UNIQUE, not function-based — Oracle also refuses to BUILD a
-- function-based index on a VPD-protected table without a policy exemption (the same
-- ORA-28133 family of restriction), and a single-column unique index/constraint in
-- Oracle already tolerates unlimited NULLs without collision (unlike the composite-key
-- NULL-collision fixed in migration 0010 — that one only bites composite keys).
ALTER TABLE DONATIONS ADD CONSTRAINT UX_DON_MUTATION UNIQUE (MUTATION_ID)
;
CREATE INDEX IX_DON_TENANT_SEQ ON DONATIONS(TENANT_ID, CHANGE_SEQ)
;
ALTER TABLE HOUSEHOLDS ADD (
  SERVER_VERSION  NUMBER(10),
  CHANGE_SEQ      NUMBER(19),
  HLC             VARCHAR2(64),
  MUTATION_ID     VARCHAR2(36),
  FIELD_CLOCKS    CLOB,
  DELETED_AT      TIMESTAMP WITH TIME ZONE
)
;
ALTER TABLE HOUSEHOLDS ADD CONSTRAINT CK_HH_FIELD_CLOCKS CHECK (FIELD_CLOCKS IS JSON)
;
ALTER TABLE HOUSEHOLDS ADD CONSTRAINT UX_HH_MUTATION UNIQUE (MUTATION_ID)
;
CREATE INDEX IX_HH_TENANT_SEQ ON HOUSEHOLDS(TENANT_ID, CHANGE_SEQ)
;
BEGIN
  DBMS_RLS.ADD_POLICY(
    object_schema   => 'MASJID',
    object_name     => 'CHANGE_LOG',
    policy_name     => 'CHANGE_LOG_TENANT_POLICY',
    function_schema => 'MASJID',
    policy_function => 'TENANT_PREDICATE',
    statement_types => 'SELECT,INSERT,UPDATE,DELETE',
    update_check    => TRUE
  );
END;
/
