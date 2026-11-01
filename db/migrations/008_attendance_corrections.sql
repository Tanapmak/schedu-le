-- Time corrections: someone forgot to clock in or out and asks for the right time.
-- They can only ask from the session's place (studio area or the offsite spot), and the
-- admin or operation approves. Approving writes the times into attendance.
CREATE TABLE attendance_corrections (
  id              bigserial PRIMARY KEY,
  person_id       bigint NOT NULL REFERENCES people (id),
  session_id      bigint NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  attendance_id   bigint REFERENCES attendance (id) ON DELETE SET NULL,  -- the record being fixed, if any
  clock_in_at     timestamptz,           -- asked-for times; NULL = keep what is there
  clock_out_at    timestamptz,
  reason          text NOT NULL,
  lat             double precision,
  lng             double precision,
  distance_m      integer,
  status          leave_status NOT NULL DEFAULT 'pending',
  decided_by      bigint REFERENCES people (id),
  decided_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (clock_in_at IS NOT NULL OR clock_out_at IS NOT NULL),
  CHECK (clock_in_at IS NULL OR clock_out_at IS NULL OR clock_out_at > clock_in_at)
);
-- One open request per person per session.
CREATE UNIQUE INDEX attendance_corrections_one_pending ON attendance_corrections (session_id, person_id) WHERE status = 'pending';
CREATE INDEX attendance_corrections_status_idx ON attendance_corrections (status);

-- Which approved correction set a record's times (shown as "corrected" to the admin).
ALTER TABLE attendance ADD COLUMN correction_id bigint REFERENCES attendance_corrections (id) ON DELETE SET NULL;
