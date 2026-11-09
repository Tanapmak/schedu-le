-- Content shooting queue: video operation books MC/PD for video shoots.
-- A shoot must never clash with that person's live sessions (checked by the API before saving)
-- and one person can't be in two shoots at once (exclusion constraint below).

-- 'video' app role: plans content shoots, sees the live schedule read-only.
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'video';

CREATE TABLE content_shoots (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL,
  period      tstzrange NOT NULL CHECK (NOT isempty(period) AND lower_inc(period) AND NOT upper_inc(period)),
  location    text,
  note        text,
  created_by  bigint REFERENCES people (id),
  updated_by  bigint REFERENCES people (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX content_shoots_period_idx ON content_shoots USING gist (period);

-- Who is in a shoot. period is copied from the shoot by triggers so the per-person
-- overlap rule can be a plain constraint (same idea as session_staff).
CREATE TABLE content_shoot_people (
  shoot_id   bigint NOT NULL REFERENCES content_shoots (id) ON DELETE CASCADE,
  person_id  bigint NOT NULL REFERENCES people (id),
  period     tstzrange NOT NULL,
  PRIMARY KEY (shoot_id, person_id),
  CONSTRAINT content_shoot_person_no_overlap EXCLUDE USING gist (person_id WITH =, period WITH &&)
);
CREATE INDEX content_shoot_people_person_idx ON content_shoot_people (person_id);

CREATE FUNCTION content_shoot_people_sync() RETURNS trigger AS $$
BEGIN
  SELECT period INTO NEW.period FROM content_shoots WHERE id = NEW.shoot_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_shoot_people_sync
  BEFORE INSERT OR UPDATE OF shoot_id ON content_shoot_people
  FOR EACH ROW EXECUTE FUNCTION content_shoot_people_sync();

CREATE FUNCTION content_shoots_propagate() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.period IS DISTINCT FROM OLD.period THEN
    UPDATE content_shoot_people SET period = NEW.period WHERE shoot_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_shoots_propagate
  BEFORE UPDATE ON content_shoots
  FOR EACH ROW EXECUTE FUNCTION content_shoots_propagate();
