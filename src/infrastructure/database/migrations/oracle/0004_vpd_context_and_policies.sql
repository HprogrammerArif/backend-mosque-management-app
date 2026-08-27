CREATE OR REPLACE PACKAGE masjid_ctx_pkg AS
  PROCEDURE set_tenant(p_tenant_id VARCHAR2);
END;
/
CREATE OR REPLACE PACKAGE BODY masjid_ctx_pkg AS
  PROCEDURE set_tenant(p_tenant_id VARCHAR2) IS
  BEGIN
    DBMS_SESSION.SET_CONTEXT('masjid_ctx', 'tenant_id', p_tenant_id);
  END;
END;
/
CREATE OR REPLACE CONTEXT masjid_ctx USING masjid_ctx_pkg
;
CREATE OR REPLACE FUNCTION tenant_predicate(p_schema VARCHAR2, p_object VARCHAR2)
RETURN VARCHAR2 AS
BEGIN
  IF SYS_CONTEXT('masjid_ctx', 'tenant_id') IS NULL THEN
    RETURN '1=0';
  END IF;
  RETURN 'TENANT_ID = SYS_CONTEXT(''masjid_ctx'', ''tenant_id'')';
END;
/
BEGIN
  DBMS_RLS.ADD_POLICY(
    object_schema   => 'MASJID',
    object_name     => 'FUNDS',
    policy_name     => 'FUNDS_TENANT_POLICY',
    function_schema => 'MASJID',
    policy_function => 'TENANT_PREDICATE',
    statement_types => 'SELECT,INSERT,UPDATE,DELETE',
    update_check    => TRUE
  );
END;
/
