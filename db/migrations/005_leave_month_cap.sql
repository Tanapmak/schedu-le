-- Full-time MC/PD may take at most this many normal leave days a month (urgent leave not counted).
INSERT INTO rules (key, value) VALUES ('leave_max_days_per_month', '{"mc": 8, "pd": 8}') ON CONFLICT (key) DO NOTHING;
