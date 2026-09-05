-- =========================================================
-- Fixture Production Database — Schema
-- Simulates an external factory production database (Source #3)
-- Covers: SORTING (step 2), WASHING (step 3), DRYING (step 4),
--         FOLDING (step 5), DISPATCH (step 6 alt)
-- =========================================================

CREATE TABLE IF NOT EXISTS production_events (
  id               SERIAL PRIMARY KEY,
  source_record_id VARCHAR(64)  NOT NULL UNIQUE,  -- stable source identifier
  batch_id         VARCHAR(32)  NOT NULL,
  station_code     VARCHAR(32)  NOT NULL,          -- SORTING | WASHING | DRYING | FOLDING | DISPATCH
  quantity         INTEGER      NOT NULL,
  event_time       TIMESTAMPTZ  NOT NULL,
  operator_id      VARCHAR(32),
  line_id          VARCHAR(32),
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_events_batch_id    ON production_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_prod_events_station     ON production_events(station_code);
CREATE INDEX IF NOT EXISTS idx_prod_events_event_time  ON production_events(event_time);
