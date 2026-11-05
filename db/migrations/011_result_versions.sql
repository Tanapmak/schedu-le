-- v2.1: edits keep history. Editing a reading inserts a new version and marks the old one
-- superseded; only current readings count. Screenshots are kept so an edit can show them.
ALTER TABLE live_results
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by bigint REFERENCES live_results (id) ON DELETE SET NULL,
  ADD COLUMN replaces_id   bigint REFERENCES live_results (id) ON DELETE SET NULL,
  ADD COLUMN version       integer NOT NULL DEFAULT 1;
CREATE INDEX live_results_current_idx ON live_results (broadcast_id, captured_at) WHERE superseded_at IS NULL;

-- One screenshot per reading (a shrunk JPEG, ~200-400 KB). Versions share the original's image
-- unless the PD changes it.
CREATE TABLE live_result_images (
  result_id   bigint PRIMARY KEY REFERENCES live_results (id) ON DELETE CASCADE,
  media_type  text NOT NULL,
  width       integer,
  height      integer,
  data        bytea NOT NULL,
  boxes       jsonb NOT NULL DEFAULT '[]'
);

-- Only current readings, each minus the previous current reading of the same broadcast.
DROP VIEW live_result_deltas;
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
 WHERE r.superseded_at IS NULL
WINDOW w AS (PARTITION BY r.broadcast_id ORDER BY r.captured_at, r.id);
