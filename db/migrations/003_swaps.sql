-- Shift swaps. An MC/PD asks to hand their place in a session to someone else
-- (target_session_id NULL), or to trade places with them (target_session_id = the
-- target's session, which the requester takes over). The admin approves.
CREATE TYPE swap_status AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

CREATE TABLE swap_requests (
  id                 bigserial PRIMARY KEY,
  requester_id       bigint NOT NULL REFERENCES people (id),
  session_id         bigint NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  target_id          bigint NOT NULL REFERENCES people (id),
  target_session_id  bigint REFERENCES sessions (id) ON DELETE CASCADE,
  reason             text,
  status             swap_status NOT NULL DEFAULT 'pending',
  decided_by         bigint REFERENCES people (id),
  decided_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> target_id),
  CHECK (target_session_id IS NULL OR target_session_id <> session_id)
);
CREATE INDEX swap_requests_status_idx ON swap_requests (status);

-- Who filed a leave request (an admin may file for someone, e.g. urgent sick leave by phone).
ALTER TABLE leave_requests ADD COLUMN created_by bigint REFERENCES people (id);
