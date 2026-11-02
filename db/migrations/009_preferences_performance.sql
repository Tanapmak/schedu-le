-- What each person would like (free text, typed by them). The AI scheduler reads it, and
-- the admin sees it when planning.
CREATE TABLE preferences (
  person_id   bigint PRIMARY KEY REFERENCES people (id) ON DELETE CASCADE,
  text        text NOT NULL CHECK (length(text) <= 2000),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Past lives from before the app (the cleaned history sheet), one row per session, so the
-- scheduler can see who sells well in which room and time of day. Names are kept as written
-- and matched to people by nickname. Lives recorded in the app are read from live_results.
CREATE TABLE performance_history (
  id          bigserial PRIMARY KEY,
  room_code   text NOT NULL,
  started_at  timestamptz NOT NULL,
  hours       numeric(6, 2) NOT NULL CHECK (hours > 0),
  mc          text[] NOT NULL DEFAULT '{}',
  pd          text[] NOT NULL DEFAULT '{}',
  gmv         numeric(14, 2) CHECK (gmv >= 0),
  orders      integer,
  views       integer,
  campaign    text
);
CREATE INDEX performance_history_started_idx ON performance_history (started_at);
