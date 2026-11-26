-- Off-site lives: a session can be set to a place other than the studio.
-- The place's name and its own check-in radius sit next to the existing offsite_lat/lng.
-- Clock in/out for that session checks against this place instead of the studio area.
ALTER TABLE sessions
  ADD COLUMN offsite_name     text,
  ADD COLUMN offsite_radius_m integer NOT NULL DEFAULT 300 CHECK (offsite_radius_m BETWEEN 20 AND 5000);
