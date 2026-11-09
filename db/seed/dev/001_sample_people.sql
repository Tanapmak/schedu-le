-- Sample people for local development only (npm run seed -- --dev).
-- Real people are loaded from Bright's list, not from this file.

INSERT INTO people (nickname, email, position, app_role) VALUES
  ('Admin Dev', 'admin@example.com', 'operation', 'admin'),
  ('MC A',      'mc.a@example.com',  'mc',        'mc'),
  ('MC B',      'mc.b@example.com',  'mc',        'mc'),
  ('PD A',      'pd.a@example.com',  'pd',        'pd'),
  ('PD B',      'pd.b@example.com',  'pd',        'pd')
ON CONFLICT (nickname) DO NOTHING;

-- Operation role (run separately: the role value comes from migration 007).
INSERT INTO people (nickname, email, position, app_role) VALUES
  ('Ops Dev', 'ops@example.com', 'operation', 'operation')
ON CONFLICT (nickname) DO NOTHING;

-- Video operation role (value from migration 013): plans content shoots.
INSERT INTO people (nickname, email, position, app_role) VALUES
  ('Video Dev', 'video@example.com', 'operation', 'video')
ON CONFLICT (nickname) DO NOTHING;
