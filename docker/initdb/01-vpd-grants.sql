-- Runs once, as a privileged user, right after APP_USER is created on first init
-- (gvenzl/oracle-free's documented extension point). Not something the app's own
-- migrations can grant themselves — those run as `masjid`, a non-DBA user, by design.
--
-- Without these, `masjid` cannot create the VPD application context or manage
-- DBMS_RLS policies used by the tenancy migrations (see Phase 2A, Task 1/4).
ALTER SESSION SET CONTAINER = FREEPDB1;

GRANT CREATE ANY CONTEXT TO masjid;
GRANT EXECUTE ON SYS.DBMS_RLS TO masjid;
GRANT DROP ANY CONTEXT TO masjid;
