-- Reference data that every environment needs. Safe to re-run.

INSERT INTO rooms (code, platform, name, calendar_code) VALUES
  ('TTS 1', 'tiktok', 'TikTok 1', 'TIKTOK'),
  ('TTS 2', 'tiktok', 'TikTok 2 (iFFALCON, เดิม TCL Home)', 'TIKTOK'),
  ('TTS 3', 'tiktok', 'TikTok 3', 'TIKTOK'),
  ('SHP 1', 'shopee', 'Shopee 1', 'SHP_MAIN'),
  ('SHP 2', 'shopee', 'Shopee 2', 'SHP_AUTH'),
  ('SHP 3', 'shopee', 'Shopee 3', 'SHP_HOMECARE'),
  ('LZD 1', 'lazada', 'Lazada 1', 'LAZ_MAIN'),
  ('LZD 2', 'lazada', 'Lazada 2', 'LAZ_AUTH')
ON CONFLICT (code) DO NOTHING;

INSERT INTO rules (key, value) VALUES
  ('kpi_hours',              '{"mc": 96, "pd": 132}'),
  ('max_hours',              '{"mc": 124, "pd": 176}'),
  ('leave_quota_per_day',    '{"mc": 2, "pd": 2}'),
  ('session_slot_minutes',   '120'),
  ('clock_in_window_minutes','30')
ON CONFLICT (key) DO NOTHING;
