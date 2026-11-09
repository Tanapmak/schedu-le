-- Urgent leave reasons, and hours credited person by person when a session is cancelled.
--
-- Rules (agreed with Bright, 2026-11-09):
--  * Urgent leave picks a reason: sick / accident / family emergency earn hours for the
--    cancelled session, unless the person comes back to work later that live day
--    (until 06:00). Personal errand and other reasons earn none.
--  * Sick leave on two or more live days in a row needs a medical certificate on every
--    one of them before any of those days earn hours (deadline: the 25th of next month).
--  * Admin / operation may override anyone, with a note (kept in audit_log).

ALTER TABLE leave_requests
  ADD COLUMN reason_code text CHECK (reason_code IN ('sick', 'accident', 'family', 'errand', 'other')),
  -- Set when the leave was cut short because the person clocked in for a later session.
  ADD COLUMN original_period tstzrange;

-- Old urgent leave only had free text: read "sick" out of it, the rest is "other".
UPDATE leave_requests
   SET reason_code = CASE WHEN reason ~* '(ป่วย|ไม่สบาย|\msick\M|\mill\M|病)' THEN 'sick' ELSE 'other' END
 WHERE kind = 'urgent';

-- The reason code replaces the old rule that urgent leave needs free text.
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_urgent_reason_code CHECK (kind <> 'urgent' OR reason_code IS NOT NULL);

-- Medical certificates (photo or PDF), kept for good.
CREATE TABLE leave_documents (
  id          bigserial PRIMARY KEY,
  leave_id    bigint NOT NULL REFERENCES leave_requests (id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  media_type  text NOT NULL,
  data        bytea NOT NULL,
  uploaded_by bigint REFERENCES people (id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leave_documents_leave_idx ON leave_documents (leave_id);

ALTER TABLE sessions
  ADD COLUMN cancel_reason_code text CHECK (cancel_reason_code IN ('leave_no_cover', 'force_majeure', 'meeting', 'brand', 'other'));

-- 'auto' follows the rules above; 'yes' / 'no' is a manager's decision for this person.
ALTER TABLE session_staff
  ADD COLUMN hours_credit text NOT NULL DEFAULT 'auto' CHECK (hours_credit IN ('auto', 'yes', 'no')),
  ADD COLUMN credit_note text,
  ADD COLUMN credit_by bigint REFERENCES people (id),
  ADD COLUMN credit_at timestamptz,
  ADD CONSTRAINT session_staff_credit_note CHECK (hours_credit = 'auto' OR credit_note IS NOT NULL);

-- Sessions cancelled without counting hours keep that answer for everyone on them.
UPDATE session_staff st
   SET hours_credit = 'no', credit_note = 'Cancelled before per-person hours (no hours)'
  FROM sessions s
 WHERE s.id = st.session_id AND s.status = 'cancelled' AND NOT s.count_hours_when_cancelled;
