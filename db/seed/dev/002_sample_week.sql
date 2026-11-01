-- Sample published sessions around today, for trying My Schedule, swaps, hours,
-- results and the payroll export locally. Only runs on an empty schedule.
INSERT INTO people (nickname, email, position, employment, app_role) VALUES
  ('P-Arm (guest)',      'guest@example.com', 'mc', 'guest',     'viewer'),
  ('FL-Kaew (freelance)', 'fl@example.com',   'pd', 'freelance', 'pd')
ON CONFLICT (nickname) DO NOTHING;

DO $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Bangkok')::date;
  d int;
  sid bigint;
  p record;
BEGIN
  IF EXISTS (SELECT 1 FROM sessions) THEN RETURN; END IF;
  SELECT
    (SELECT id FROM people WHERE nickname = 'MC A') AS mc_a, (SELECT id FROM people WHERE nickname = 'MC B') AS mc_b,
    (SELECT id FROM people WHERE nickname = 'PD A') AS pd_a, (SELECT id FROM people WHERE nickname = 'PD B') AS pd_b,
    (SELECT id FROM people WHERE nickname = 'P-Arm (guest)') AS guest, (SELECT id FROM people WHERE nickname = 'FL-Kaew (freelance)') AS fl
    INTO p;
  -- From 10 days ago to 14 days ahead: a morning live on TTS 1, an afternoon on SHP 1, an evening on TTS 2.
  FOR d IN -10..14 LOOP
    INSERT INTO sessions (room_id, period, status)
      VALUES ((SELECT id FROM rooms WHERE code = 'TTS 1'),
              tstzrange(((today + d) + time '10:00') AT TIME ZONE 'Asia/Bangkok', ((today + d) + time '12:00') AT TIME ZONE 'Asia/Bangkok'), 'published')
      RETURNING id INTO sid;
    INSERT INTO session_staff (session_id, person_id, role) VALUES (sid, p.mc_a, 'mc'), (sid, p.pd_a, 'pd');

    INSERT INTO sessions (room_id, period, status)
      VALUES ((SELECT id FROM rooms WHERE code = 'SHP 1'),
              tstzrange(((today + d) + time '14:00') AT TIME ZONE 'Asia/Bangkok', ((today + d) + time '17:00') AT TIME ZONE 'Asia/Bangkok'), 'published')
      RETURNING id INTO sid;
    INSERT INTO session_staff (session_id, person_id, role)
      VALUES (sid, CASE WHEN d % 3 = 0 THEN p.guest ELSE p.mc_b END, 'mc'), (sid, CASE WHEN d % 2 = 0 THEN p.fl ELSE p.pd_b END, 'pd');

    INSERT INTO sessions (room_id, period, status)
      VALUES ((SELECT id FROM rooms WHERE code = 'TTS 2'),
              tstzrange(((today + d) + time '19:00') AT TIME ZONE 'Asia/Bangkok', ((today + d) + time '21:00') AT TIME ZONE 'Asia/Bangkok'), 'published')
      RETURNING id INTO sid;
    INSERT INTO session_staff (session_id, person_id, role) VALUES (sid, CASE WHEN d % 4 = 0 THEN p.pd_a ELSE p.mc_b END, 'mc'), (sid, p.pd_b, 'pd');
  END LOOP;
END $$;
