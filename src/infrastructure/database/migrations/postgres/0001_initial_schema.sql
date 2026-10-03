-- ============================================================================
-- Masjid OS - PostgreSQL / Neon Cloud Schema
-- Generated to match Oracle Database specifications 1-to-1
-- ============================================================================

-- Oracle Dual table compatibility view
CREATE OR REPLACE VIEW dual AS SELECT 'X'::text AS dummy;

-- Compatibility Functions: NVL, ADD_MONTHS, TRUNC, SYSTIMESTAMP, SYSDATE
CREATE OR REPLACE FUNCTION nvl(val anyelement, fallback anyelement)
RETURNS anyelement LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(val, fallback);
$$;

CREATE OR REPLACE FUNCTION add_months(d timestamptz, n integer)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT (d + (n || ' month')::interval);
$$;

CREATE OR REPLACE FUNCTION trunc(d timestamptz, fmt text)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT date_trunc(
    CASE lower(fmt)
      WHEN 'mm' THEN 'month'
      WHEN 'yyyy' THEN 'year'
      WHEN 'yy' THEN 'year'
      WHEN 'dd' THEN 'day'
      ELSE 'day'
    END, d);
$$;

CREATE OR REPLACE FUNCTION systimestamp()
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT clock_timestamp();
$$;

CREATE OR REPLACE FUNCTION sysdate()
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT clock_timestamp();
$$;

-- Operator overloading for timestamp + integer (days) compatibility with Oracle
CREATE OR REPLACE FUNCTION add_days_to_timestamp(ts timestamptz, days integer)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT ts + (days || ' days')::interval;
$$;

CREATE OR REPLACE FUNCTION sub_days_from_timestamp(ts timestamptz, days integer)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT ts - (days || ' days')::interval;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_operator o
    JOIN pg_type t ON o.oprleft = t.oid
    WHERE o.oprname = '+' AND t.typname = 'timestamptz'
  ) THEN
    CREATE OPERATOR + (
      LEFTARG = timestamptz,
      RIGHTARG = integer,
      FUNCTION = add_days_to_timestamp
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_operator o
    JOIN pg_type t ON o.oprleft = t.oid
    WHERE o.oprname = '-' AND t.typname = 'timestamptz'
  ) THEN
    CREATE OPERATOR - (
      LEFTARG = timestamptz,
      RIGHTARG = integer,
      FUNCTION = sub_days_from_timestamp
    );
  END IF;
END $$;

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id                 VARCHAR(36) PRIMARY KEY,
  phone              VARCHAR(20),
  email              VARCHAR(255),
  password_hash      VARCHAR(255) NOT NULL,
  display_name       VARCHAR(120) NOT NULL,
  locale             VARCHAR(10) DEFAULT 'en' NOT NULL,
  phone_verified_at  TIMESTAMPTZ,
  email_verified_at  TIMESTAMPTZ,
  failed_attempts    INT DEFAULT 0 NOT NULL,
  locked_until       TIMESTAMPTZ,
  status             VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone ON users(phone);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email ON users(lower(email));

-- 2. DEVICES
CREATE TABLE IF NOT EXISTS devices (
  id            VARCHAR(36) PRIMARY KEY,
  user_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      VARCHAR(10) NOT NULL,
  model         VARCHAR(120),
  app_version   VARCHAR(20),
  push_token    VARCHAR(255),
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_devices_user ON devices(user_id);

-- 3. REFRESH_TOKENS
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           VARCHAR(36) PRIMARY KEY,
  user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id    VARCHAR(36) NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  family_id    VARCHAR(36) NOT NULL,
  token_hash   VARCHAR(128) NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  replaced_by  VARCHAR(36),
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_rt_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS ix_rt_family ON refresh_tokens(family_id);

-- 4. MOSQUES (TENANTS)
CREATE TABLE IF NOT EXISTS mosques (
  id                 VARCHAR(36) PRIMARY KEY,
  name               VARCHAR(200) NOT NULL,
  timezone           VARCHAR(50) NOT NULL,
  latitude           NUMERIC(9,6) NOT NULL,
  longitude          NUMERIC(9,6) NOT NULL,
  status             VARCHAR(20) DEFAULT 'PROVISIONING' NOT NULL,
  created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. MEMBERSHIPS
CREATE TABLE IF NOT EXISTS memberships (
  id          VARCHAR(36) PRIMARY KEY,
  mosque_id   VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  user_id     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL,
  status      VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT ux_memberships_mosque_user UNIQUE (mosque_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_memberships_user ON memberships(user_id);

-- 6. FUNDS
CREATE TABLE IF NOT EXISTS funds (
  id              VARCHAR(36) PRIMARY KEY,
  tenant_id       VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  type            VARCHAR(20) NOT NULL,
  name            VARCHAR(100) NOT NULL,
  zakat_eligible  INT DEFAULT 0 NOT NULL,
  corpus_minor    BIGINT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_funds_tenant ON funds(tenant_id);

-- 7. INVITATIONS
CREATE TABLE IF NOT EXISTS invitations (
  id              VARCHAR(36) PRIMARY KEY,
  mosque_id       VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  email_or_phone  VARCHAR(255) NOT NULL,
  role            VARCHAR(20) NOT NULL,
  token_hash      VARCHAR(128) NOT NULL,
  invited_by      VARCHAR(36) NOT NULL REFERENCES users(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_invitations_hash ON invitations(token_hash);
CREATE INDEX IF NOT EXISTS ix_invitations_mosque ON invitations(mosque_id);

-- 8. PRAYER_CONFIG
CREATE TABLE IF NOT EXISTS prayer_config (
  tenant_id           VARCHAR(36) PRIMARY KEY REFERENCES mosques(id) ON DELETE CASCADE,
  calculation_method  VARCHAR(30) NOT NULL,
  fajr_offset_min     INT DEFAULT 0 NOT NULL,
  dhuhr_offset_min    INT DEFAULT 0 NOT NULL,
  asr_offset_min      INT DEFAULT 0 NOT NULL,
  maghrib_offset_min  INT DEFAULT 0 NOT NULL,
  isha_offset_min     INT DEFAULT 0 NOT NULL,
  fajr_fixed_time     VARCHAR(5),
  dhuhr_fixed_time    VARCHAR(5),
  asr_fixed_time      VARCHAR(5),
  maghrib_fixed_time  VARCHAR(5),
  isha_fixed_time     VARCHAR(5),
  jumuah_time         VARCHAR(5),
  updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 9. HOUSEHOLDS
CREATE TABLE IF NOT EXISTS households (
  id                  VARCHAR(36) PRIMARY KEY,
  tenant_id           VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name                VARCHAR(200) NOT NULL,
  head_individual_id  VARCHAR(36),
  address_line1       VARCHAR(200),
  area                VARCHAR(100),
  phone               VARCHAR(20),
  monthly_dues_minor  BIGINT DEFAULT 0 NOT NULL,
  collector_user_id   VARCHAR(36) REFERENCES users(id),
  exempt              INT DEFAULT 0 NOT NULL,
  joined_on           DATE,
  status              VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
  created_by          VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  server_version      INT,
  change_seq          BIGINT,
  hlc                 VARCHAR(64),
  mutation_id         VARCHAR(36),
  field_clocks        TEXT,
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT ux_hh_mutation UNIQUE (mutation_id)
);

CREATE INDEX IF NOT EXISTS ix_hh_tenant ON households(tenant_id, status);

-- 10. INDIVIDUALS
CREATE TABLE IF NOT EXISTS individuals (
  id             VARCHAR(36) PRIMARY KEY,
  tenant_id      VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  household_id   VARCHAR(36) NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id        VARCHAR(36) REFERENCES users(id),
  full_name      VARCHAR(200) NOT NULL,
  relation       VARCHAR(20) NOT NULL,
  phone          VARCHAR(20),
  date_of_birth  DATE,
  gender         VARCHAR(10),
  created_by     VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_ind_tenant_hh ON individuals(tenant_id, household_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_hh_head'
  ) THEN
    ALTER TABLE households ADD CONSTRAINT fk_hh_head
      FOREIGN KEY (head_individual_id) REFERENCES individuals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 11. DONATIONS
CREATE TABLE IF NOT EXISTS donations (
  id                 VARCHAR(36) PRIMARY KEY,
  tenant_id          VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  fund_id            VARCHAR(36) NOT NULL REFERENCES funds(id),
  amount_minor       BIGINT NOT NULL,
  currency           VARCHAR(3) NOT NULL,
  occurred_on        DATE NOT NULL,
  method             VARCHAR(20) NOT NULL,
  donor_household_id VARCHAR(36) REFERENCES households(id),
  donor_name         VARCHAR(200),
  anonymous          INT DEFAULT 0 NOT NULL,
  receipt_no         VARCHAR(30),
  note               VARCHAR(500),
  adjusts_id         VARCHAR(36) REFERENCES donations(id),
  adjustment_reason  VARCHAR(500),
  created_by         VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  server_version     INT,
  change_seq         BIGINT,
  hlc                VARCHAR(64),
  mutation_id        VARCHAR(36),
  CONSTRAINT ux_don_mutation UNIQUE (mutation_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_don_receipt ON donations(tenant_id, receipt_no) WHERE receipt_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_don_tenant_date ON donations(tenant_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS ix_don_tenant_fund ON donations(tenant_id, fund_id, occurred_on);
CREATE INDEX IF NOT EXISTS ix_don_tenant_hh ON donations(tenant_id, donor_household_id, occurred_on);
CREATE INDEX IF NOT EXISTS ix_don_tenant_seq ON donations(tenant_id, change_seq);

-- 12. EXPENSE_CATEGORIES
CREATE TABLE IF NOT EXISTS expense_categories (
  id              VARCHAR(36) PRIMARY KEY,
  tenant_id       VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  zakat_eligible  INT DEFAULT 0 NOT NULL,
  asnaf_category  VARCHAR(30),
  is_system       INT DEFAULT 0 NOT NULL,
  created_by      VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT ux_expcat_name UNIQUE (tenant_id, name)
);

-- 13. EXPENSES
CREATE TABLE IF NOT EXISTS expenses (
  id                 VARCHAR(36) PRIMARY KEY,
  tenant_id          VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  fund_id            VARCHAR(36) NOT NULL REFERENCES funds(id),
  category_id        VARCHAR(36) NOT NULL REFERENCES expense_categories(id),
  amount_minor       BIGINT NOT NULL,
  currency           VARCHAR(3) NOT NULL,
  occurred_on        DATE NOT NULL,
  payee              VARCHAR(200),
  description        VARCHAR(500),
  method             VARCHAR(20) NOT NULL,
  approval_status    VARCHAR(20) DEFAULT 'POSTED' NOT NULL,
  adjusts_id         VARCHAR(36) REFERENCES expenses(id),
  adjustment_reason  VARCHAR(500),
  created_by         VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_exp_tenant_date ON expenses(tenant_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS ix_exp_tenant_fund ON expenses(tenant_id, fund_id, occurred_on);

-- 14. SYNC ENGINE SEQUENCE & CHANGE LOG
CREATE SEQUENCE IF NOT EXISTS seq_change START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS change_log (
  change_seq  BIGINT PRIMARY KEY DEFAULT nextval('seq_change'),
  tenant_id   VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  entity      VARCHAR(30) NOT NULL,
  entity_id   VARCHAR(36) NOT NULL,
  op          VARCHAR(10) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_cl_tenant_entity_seq ON change_log(tenant_id, entity, change_seq);

-- 15. DUES_CHARGES
CREATE TABLE IF NOT EXISTS dues_charges (
  id             VARCHAR(36) PRIMARY KEY,
  tenant_id      VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  household_id   VARCHAR(36) NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  period         VARCHAR(7) NOT NULL,
  amount_minor   BIGINT NOT NULL,
  paid_minor     BIGINT DEFAULT 0 NOT NULL,
  currency       VARCHAR(3) NOT NULL,
  due_on         DATE NOT NULL,
  status         VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
  waived_by      VARCHAR(36) REFERENCES users(id),
  waived_reason  VARCHAR(500),
  created_by     VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT ux_dc_period UNIQUE (tenant_id, household_id, period)
);

CREATE INDEX IF NOT EXISTS ix_dc_tenant_period ON dues_charges(tenant_id, period, status);

-- 16. DUES_PAYMENTS
CREATE TABLE IF NOT EXISTS dues_payments (
  id             VARCHAR(36) PRIMARY KEY,
  tenant_id      VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  charge_id      VARCHAR(36) NOT NULL REFERENCES dues_charges(id) ON DELETE CASCADE,
  fund_id        VARCHAR(36) NOT NULL REFERENCES funds(id),
  amount_minor   BIGINT NOT NULL,
  currency       VARCHAR(3) NOT NULL,
  paid_on        DATE NOT NULL,
  method         VARCHAR(20) NOT NULL,
  collected_by   VARCHAR(36) REFERENCES users(id),
  created_by     VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_dp_tenant_charge ON dues_payments(tenant_id, charge_id);

-- 17. STAFF
CREATE TABLE IF NOT EXISTS staff (
  id                   VARCHAR(36) PRIMARY KEY,
  tenant_id            VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name                 VARCHAR(200) NOT NULL,
  role_title           VARCHAR(100),
  phone                VARCHAR(20),
  monthly_salary_minor BIGINT DEFAULT 0 NOT NULL,
  currency             VARCHAR(3) DEFAULT 'BDT' NOT NULL,
  status               VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
  joined_on            DATE,
  created_by           VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_staff_tenant_status ON staff(tenant_id, status);

-- 18. PAYROLL_RUNS
CREATE TABLE IF NOT EXISTS payroll_runs (
  id          VARCHAR(36) PRIMARY KEY,
  tenant_id   VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  period      VARCHAR(7) NOT NULL,
  fund_id     VARCHAR(36) NOT NULL REFERENCES funds(id),
  status      VARCHAR(20) DEFAULT 'DRAFT' NOT NULL,
  posted_at   TIMESTAMPTZ,
  created_by  VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT ux_pr_period UNIQUE (tenant_id, period)
);

-- 19. PAYROLL_LINES
CREATE TABLE IF NOT EXISTS payroll_lines (
  id            VARCHAR(36) PRIMARY KEY,
  tenant_id     VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  run_id        VARCHAR(36) NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  staff_id      VARCHAR(36) NOT NULL REFERENCES staff(id),
  amount_minor  BIGINT NOT NULL,
  currency      VARCHAR(3) NOT NULL,
  expense_id    VARCHAR(36) REFERENCES expenses(id),
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT ux_pl_run_staff UNIQUE (tenant_id, run_id, staff_id)
);

CREATE INDEX IF NOT EXISTS ix_pl_tenant_run ON payroll_lines(tenant_id, run_id);

-- 20. COMMITTEE_MEMBERS
CREATE TABLE IF NOT EXISTS committee_members (
  id          VARCHAR(36) PRIMARY KEY,
  tenant_id   VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  position    VARCHAR(100),
  phone       VARCHAR(20),
  term_start  DATE,
  term_end    DATE,
  status      VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
  created_by  VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_cm_tenant_status ON committee_members(tenant_id, status);

-- 21. EVENTS
CREATE TABLE IF NOT EXISTS events (
  id           VARCHAR(36) PRIMARY KEY,
  tenant_id    VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  title        VARCHAR(200) NOT NULL,
  description  VARCHAR(2000),
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ,
  location     VARCHAR(200),
  created_by   VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_events_tenant_starts ON events(tenant_id, starts_at);

-- 22. ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS announcements (
  id          VARCHAR(36) PRIMARY KEY,
  tenant_id   VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  body        VARCHAR(2000) NOT NULL,
  urgent      INT DEFAULT 0 NOT NULL,
  created_by  VARCHAR(36) NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_an_tenant_created ON announcements(tenant_id, created_at);

-- 23. PLANS & SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS plans (
  code          VARCHAR(20) PRIMARY KEY,
  name          VARCHAR(60) NOT NULL,
  entitlements  TEXT NOT NULL,
  active        INT DEFAULT 1 NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   VARCHAR(36) PRIMARY KEY,
  mosque_id            VARCHAR(36) NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  plan_code            VARCHAR(20) NOT NULL REFERENCES plans(code),
  status               VARCHAR(20) NOT NULL,
  billing_period       VARCHAR(10) DEFAULT 'MONTHLY' NOT NULL,
  price_minor          BIGINT DEFAULT 0 NOT NULL,
  currency             VARCHAR(3) DEFAULT 'BDT' NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  trial_ends_at        TIMESTAMPTZ,
  cancel_at_period_end INT DEFAULT 0 NOT NULL,
  provider             VARCHAR(30),
  provider_ref         VARCHAR(120),
  created_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT ux_sub_mosque UNIQUE (mosque_id)
);

-- 24. NOTIFICATION_PREFERENCES
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id           VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  announcements     INT DEFAULT 1 NOT NULL,
  dues_reminders    INT DEFAULT 1 NOT NULL,
  prayer_reminders  INT DEFAULT 1 NOT NULL,
  events            INT DEFAULT 1 NOT NULL,
  quiet_hours_start VARCHAR(5) DEFAULT '22:00' NOT NULL,
  quiet_hours_end   VARCHAR(5) DEFAULT '06:00' NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 25. SEED DEFAULT PLANS
INSERT INTO plans (code, name, entitlements, active) VALUES
  ('BASIC', 'Basic', '{"features":[],"limits":{"adminUsers":3,"members":null,"historyMonths":12}}', 1)
ON CONFLICT (code) DO NOTHING;

INSERT INTO plans (code, name, entitlements, active) VALUES
  ('PRO', 'Pro', '{"features":["ONLINE_DONATIONS","PAYROLL","EXPORT"],"limits":{"adminUsers":10,"members":null,"historyMonths":36}}', 1)
ON CONFLICT (code) DO NOTHING;
