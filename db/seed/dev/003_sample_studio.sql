-- A sample studio for trying clock in locally. Set the real place in the app
-- (Attendance > Studio area > "Use my current location").
INSERT INTO studios (name, lat, lng, radius_m) VALUES ('Studio (sample)', 13.7563, 100.5018, 100)
ON CONFLICT (name) DO NOTHING;
