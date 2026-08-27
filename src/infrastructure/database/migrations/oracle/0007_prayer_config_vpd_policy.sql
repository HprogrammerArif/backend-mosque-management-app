BEGIN
  DBMS_RLS.ADD_POLICY(
    object_schema   => 'MASJID',
    object_name     => 'PRAYER_CONFIG',
    policy_name     => 'PRAYER_CONFIG_TENANT_POLICY',
    function_schema => 'MASJID',
    policy_function => 'TENANT_PREDICATE',
    statement_types => 'SELECT,INSERT,UPDATE,DELETE',
    update_check    => TRUE
  );
END;
/
