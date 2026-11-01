-- Clock in / clock out. One row per person per session they work.
-- Clocking in outside the studio area needs a reason and waits for the admin (status 'pending').
CREATE TYPE attendance_status AS ENUM ('ok', 'pending', 'approved', 'rejected');

CREATE TABLE attendance (
  id              bigserial PRIMARY KEY,
  person_id       bigint NOT NULL REFERENCES people (id),
  session_id      bigint REFERENCES sessions (id) ON DELETE SET NULL,
  clock_in_at     timestamptz NOT NULL,
  clock_out_at    timestamptz,
  in_lat          double precision,
  in_lng          double precision,
  in_distance_m   integer,               -- to the nearest allowed place; NULL when no location
  in_area         boolean NOT NULL,
  out_lat         double precision,
  out_lng         double precision,
  out_distance_m  integer,
  offsite_reason  text,
  status          attendance_status NOT NULL DEFAULT 'ok',
  decided_by      bigint REFERENCES people (id),
  decided_at      timestamptz,
  adjusted_hours  numeric(5, 2) CHECK (adjusted_hours >= 0),  -- admin override of counted hours
  adjust_note     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (clock_out_at IS NULL OR clock_out_at > clock_in_at),
  CHECK (in_area OR offsite_reason IS NOT NULL)
);
-- A person has at most one open clock-in, and clocks in once per session.
CREATE UNIQUE INDEX attendance_one_open ON attendance (person_id) WHERE clock_out_at IS NULL;
CREATE UNIQUE INDEX attendance_once_per_session ON attendance (session_id, person_id) WHERE session_id IS NOT NULL;
CREATE INDEX attendance_clock_in_idx ON attendance (clock_in_at);
