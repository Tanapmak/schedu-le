-- Schedu-le v2 initial schema.
-- Overlap rules live in the database (exclusion constraints) so two people
-- saving at the same time can never create a double booking.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE app_role AS ENUM ('admin', 'mc', 'pd', 'viewer');
CREATE TYPE position_type AS ENUM ('mc', 'pd', 'operation');
CREATE TYPE employment_type AS ENUM ('full_time', 'intern', 'freelance');
CREATE TYPE session_status AS ENUM ('draft', 'published', 'cancelled');
CREATE TYPE session_location AS ENUM ('studio', 'offsite', 'home');
CREATE TYPE staff_role AS ENUM ('mc', 'pd');
CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');
CREATE TYPE leave_kind AS ENUM ('normal', 'urgent');

CREATE TABLE people (
  id            bigserial PRIMARY KEY,
  nickname      text NOT NULL UNIQUE,          -- matches mc_1 / pd_1 in BigQuery history
  full_name     text,
  email         text,                          -- Google account used to sign in
  position      position_type NOT NULL,
  employment    employment_type NOT NULL DEFAULT 'full_time',
  app_role      app_role NOT NULL DEFAULT 'viewer',
  start_date    date,                          -- for prorated pay in the joining month
  kpi_hours     numeric(6, 2),                 -- per month; NULL = use rules default
  max_hours     numeric(6, 2),                 -- per month; NULL = use rules default
  color         text,
  is_active     boolean NOT NULL DEFAULT true, -- archive instead of delete
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX people_email_key ON people (lower(email)) WHERE email IS NOT NULL;

-- A room is a store account (TTS 1, SHP 1, LZD 1, ...).
CREATE TABLE rooms (
  id            bigserial PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  platform      text NOT NULL CHECK (platform IN ('tiktok', 'shopee', 'lazada')),
  name          text NOT NULL,
  room_type     text NOT NULL DEFAULT 'live' CHECK (room_type IN ('live', 'content')),
  requires_pd   boolean NOT NULL DEFAULT true,
  calendar_code text,                          -- dim_campaign_calendar.calendar_code
  is_active     boolean NOT NULL DEFAULT true
);

CREATE TABLE studios (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  radius_m      integer NOT NULL DEFAULT 100 CHECK (radius_m > 0)
);

CREATE TABLE holidays (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  period        tstzrange NOT NULL CHECK (NOT isempty(period)),
  created_by    bigint REFERENCES people (id)
);
CREATE INDEX holidays_period_idx ON holidays USING gist (period);

CREATE TABLE sessions (
  id                 bigserial PRIMARY KEY,
  room_id            bigint NOT NULL REFERENCES rooms (id),
  period             tstzrange NOT NULL CHECK (NOT isempty(period) AND lower_inc(period) AND NOT upper_inc(period)),
  status             session_status NOT NULL DEFAULT 'draft',
  location           session_location NOT NULL DEFAULT 'studio',
  studio_id          bigint REFERENCES studios (id),
  offsite_lat        double precision,
  offsite_lng        double precision,
  cancel_reason      text,
  count_hours_when_cancelled boolean NOT NULL DEFAULT true,
  note               text,
  created_by         bigint REFERENCES people (id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL),
  CHECK (location <> 'offsite' OR (offsite_lat IS NOT NULL AND offsite_lng IS NOT NULL)),
  CONSTRAINT sessions_room_no_overlap
    EXCLUDE USING gist (room_id WITH =, period WITH &&) WHERE (status <> 'cancelled')
);

-- Who works a session and in which role. A PD can host as MC, so the role here
-- is separate from people.position. period/active are copied from the session
-- by triggers so the per-person overlap rule can be a plain constraint.
CREATE TABLE session_staff (
  id              bigserial PRIMARY KEY,
  session_id      bigint NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  person_id       bigint NOT NULL REFERENCES people (id),
  role            staff_role NOT NULL,
  replaced        boolean NOT NULL DEFAULT false, -- urgent cancel: replacement gets hours, original gets none
  replacement_of  bigint REFERENCES session_staff (id),
  period          tstzrange NOT NULL,
  active          boolean NOT NULL,
  UNIQUE (session_id, person_id),
  CONSTRAINT session_staff_person_no_overlap
    EXCLUDE USING gist (person_id WITH =, period WITH &&) WHERE (active)
);
CREATE INDEX session_staff_session_idx ON session_staff (session_id);

CREATE FUNCTION session_staff_sync_from_session() RETURNS trigger AS $$
BEGIN
  SELECT s.period, s.status <> 'cancelled' AND NOT NEW.replaced
    INTO NEW.period, NEW.active
    FROM sessions s WHERE s.id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_staff_sync
  BEFORE INSERT OR UPDATE OF session_id, replaced ON session_staff
  FOR EACH ROW EXECUTE FUNCTION session_staff_sync_from_session();

CREATE FUNCTION sessions_propagate_to_staff() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.period IS DISTINCT FROM OLD.period OR NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE session_staff
       SET period = NEW.period,
           active = NEW.status <> 'cancelled' AND NOT replaced
     WHERE session_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_propagate
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION sessions_propagate_to_staff();

CREATE TABLE leave_requests (
  id           bigserial PRIMARY KEY,
  person_id    bigint NOT NULL REFERENCES people (id),
  period       tstzrange NOT NULL CHECK (NOT isempty(period)),
  kind         leave_kind NOT NULL DEFAULT 'normal',
  reason       text,
  status       leave_status NOT NULL DEFAULT 'pending',
  decided_by   bigint REFERENCES people (id),
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'urgent' OR reason IS NOT NULL),
  -- one person cannot have two live (pending/approved) requests that overlap
  CONSTRAINT leave_no_overlap
    EXCLUDE USING gist (person_id WITH =, period WITH &&) WHERE (status IN ('pending', 'approved'))
);

-- Tunable rules (hour caps, KPI, leave quota) edited from the Settings page.
CREATE TABLE rules (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_by  bigint REFERENCES people (id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    bigint REFERENCES people (id),
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   bigint,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);

-- Read by BigQuery's nightly scheduled query (EXTERNAL_QUERY).
CREATE VIEW export_sessions AS
SELECT s.id                                   AS session_id,
       r.code                                 AS account,
       r.platform,
       (lower(s.period) AT TIME ZONE 'Asia/Bangkok')::date AS date,
       lower(s.period)                        AS start_at,
       upper(s.period)                        AS end_at,
       EXTRACT(EPOCH FROM upper(s.period) - lower(s.period)) / 3600.0 AS scheduled_hours,
       s.status::text                         AS status,
       s.location::text                       AS location,
       s.cancel_reason,
       s.count_hours_when_cancelled,
       p.nickname                             AS person,
       p.position::text                       AS position,
       st.role::text                          AS role_in_session,
       st.replaced
  FROM sessions s
  JOIN rooms r ON r.id = s.room_id
  JOIN session_staff st ON st.session_id = s.id
  JOIN people p ON p.id = st.person_id
 WHERE s.status IN ('published', 'cancelled');
