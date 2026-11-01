-- Live results: the numbers a PD reads off the platform's live dashboard during or after a
-- live. Values are cumulative per broadcast (as the dashboard shows them). A row either
-- starts a new broadcast or continues the previous one in the same room; the delta view
-- subtracts the previous reading of the same broadcast.
CREATE TABLE live_results (
  id                bigserial PRIMARY KEY,
  session_id        bigint REFERENCES sessions (id) ON DELETE SET NULL,
  room_id           bigint NOT NULL REFERENCES rooms (id),
  broadcast_id      bigint NOT NULL,                  -- id of the row that started this broadcast
  is_new_broadcast  boolean NOT NULL,
  captured_at       timestamptz NOT NULL,             -- when the numbers were read
  live_started_at   timestamptz,                      -- from the dashboard header
  duration_min      integer CHECK (duration_min >= 0),
  gmv               numeric(14, 2) CHECK (gmv >= 0),  -- as shown: before refunds
  orders            integer CHECK (orders >= 0),
  items_sold        integer CHECK (items_sold >= 0),
  views             integer CHECK (views >= 0),
  avg_view_sec      numeric(10, 2) CHECK (avg_view_sec >= 0),
  product_clicks    integer CHECK (product_clicks >= 0),
  buyers            integer CHECK (buyers >= 0),
  add_to_cart       integer CHECK (add_to_cart >= 0),
  ads_cost          numeric(14, 2) CHECK (ads_cost >= 0),
  extra_metrics     jsonb NOT NULL DEFAULT '{}',      -- platform-specific values
  source            text NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  ai_reading        jsonb,                            -- what the AI read, before the PD confirmed/edited
  note              text,
  recorded_by       bigint REFERENCES people (id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_results_room_time_idx ON live_results (room_id, captured_at);
CREATE INDEX live_results_session_idx ON live_results (session_id);

-- Each reading minus the previous reading of the same broadcast (the first reading counts in full).
CREATE VIEW live_result_deltas AS
SELECT r.*,
       r.gmv            - COALESCE(lag(r.gmv)            OVER w, 0) AS gmv_delta,
       r.orders         - COALESCE(lag(r.orders)         OVER w, 0) AS orders_delta,
       r.items_sold     - COALESCE(lag(r.items_sold)     OVER w, 0) AS items_sold_delta,
       r.views          - COALESCE(lag(r.views)          OVER w, 0) AS views_delta,
       r.product_clicks - COALESCE(lag(r.product_clicks) OVER w, 0) AS product_clicks_delta,
       r.buyers         - COALESCE(lag(r.buyers)         OVER w, 0) AS buyers_delta,
       r.add_to_cart    - COALESCE(lag(r.add_to_cart)    OVER w, 0) AS add_to_cart_delta,
       r.ads_cost       - COALESCE(lag(r.ads_cost)       OVER w, 0) AS ads_cost_delta
  FROM live_results r
WINDOW w AS (PARTITION BY r.broadcast_id ORDER BY r.captured_at, r.id);
