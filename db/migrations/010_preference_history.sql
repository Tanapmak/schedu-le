-- Preferences become a history: every time someone sends their wishes it is kept, tagged
-- with the month it is for. Planning a month reads each person's latest entry for it.
CREATE TABLE preference_entries (
  id          bigserial PRIMARY KEY,
  person_id   bigint NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  month       text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  text        text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX preference_entries_person_month_idx ON preference_entries (person_id, month, created_at DESC);

INSERT INTO preference_entries (person_id, month, text, created_at)
SELECT person_id, to_char(updated_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM'), text, updated_at
  FROM preferences WHERE text <> '';

DROP TABLE preferences;
