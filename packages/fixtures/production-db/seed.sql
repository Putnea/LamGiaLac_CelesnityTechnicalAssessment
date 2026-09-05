-- =========================================================
-- Fixture Production Database — Seed Data
-- =========================================================
-- Shared identifiers (must match api-server and supplier-site fixtures):
--   Lines:       LINE-A, LINE-B
--   Work Orders: WO-001 (LINE-A), WO-002 (LINE-B), WO-003 (LINE-A)
--   Batches:     BATCH-001 … BATCH-008
--
-- Edge cases included:
--   - DUPLICATE: BATCH-003 SORTING appears twice (same source_record_id = dedup'd)
--   - LATE EVENT: BATCH-005 SORTING arrives after WASHING event was already recorded
--   - MISSING STATION: BATCH-007 has no SORTING but has WASHING (missing-data indicator)
-- =========================================================

INSERT INTO production_events
  (source_record_id, batch_id, station_code, quantity, event_time, operator_id, line_id, notes)
VALUES

-- ── BATCH-001 (WO-001, LINE-A): full journey through DB-owned steps ─────────
('DB-SORT-001',  'BATCH-001', 'SORTING', 120, '2026-09-01 07:05:00+07', 'OP-1', 'LINE-A', NULL),
('DB-WASH-001',  'BATCH-001', 'WASHING', 120, '2026-09-01 08:30:00+07', 'OP-2', 'LINE-A', NULL),
('DB-DRY-001',   'BATCH-001', 'DRYING',  120, '2026-09-01 10:00:00+07', 'OP-2', 'LINE-A', NULL),
('DB-FOLD-001',  'BATCH-001', 'FOLDING', 118, '2026-09-01 11:20:00+07', 'OP-3', 'LINE-A', '2 damaged items removed'),

-- ── BATCH-002 (WO-001, LINE-A): completed incl. dispatch via DB ──────────────
('DB-SORT-002',  'BATCH-002', 'SORTING',  80, '2026-09-01 07:10:00+07', 'OP-1', 'LINE-A', NULL),
('DB-WASH-002',  'BATCH-002', 'WASHING',  80, '2026-09-01 08:40:00+07', 'OP-2', 'LINE-A', NULL),
('DB-DRY-002',   'BATCH-002', 'DRYING',   80, '2026-09-01 10:10:00+07', 'OP-2', 'LINE-A', NULL),
('DB-FOLD-002',  'BATCH-002', 'FOLDING',  80, '2026-09-01 11:30:00+07', 'OP-3', 'LINE-A', NULL),

-- ── BATCH-003 (WO-002, LINE-B): DUPLICATE SORTING observation ────────────────
-- First insert (canonical)
('DB-SORT-003',  'BATCH-003', 'SORTING',  60, '2026-09-01 07:15:00+07', 'OP-4', 'LINE-B', NULL),
-- Duplicate (identical source_record_id → will be caught by dedup on source_record_id UNIQUE constraint if re-inserted, or dedup logic in app)
-- We insert it with a DIFFERENT source_record_id to simulate a true source-system duplicate (same content, different ID — collector must dedup on business key)
('DB-SORT-003B', 'BATCH-003', 'SORTING',  60, '2026-09-01 07:15:00+07', 'OP-4', 'LINE-B', 'duplicate entry from operator error'),
('DB-WASH-003',  'BATCH-003', 'WASHING',  60, '2026-09-01 09:00:00+07', 'OP-5', 'LINE-B', NULL),
('DB-DRY-003',   'BATCH-003', 'DRYING',   60, '2026-09-01 10:30:00+07', 'OP-5', 'LINE-B', NULL),
('DB-FOLD-003',  'BATCH-003', 'FOLDING',  60, '2026-09-01 11:45:00+07', 'OP-6', 'LINE-B', NULL),

-- ── BATCH-004 (WO-002, LINE-B): in-progress at DRYING ────────────────────────
('DB-SORT-004',  'BATCH-004', 'SORTING', 100, '2026-09-01 09:00:00+07', 'OP-4', 'LINE-B', NULL),
('DB-WASH-004',  'BATCH-004', 'WASHING', 100, '2026-09-01 10:20:00+07', 'OP-5', 'LINE-B', NULL),
('DB-DRY-004',   'BATCH-004', 'DRYING',  100, '2026-09-01 11:50:00+07', 'OP-5', 'LINE-B', NULL),

-- ── BATCH-005 (WO-003, LINE-A): LATE EVENT — WASHING before SORTING ──────────
-- Washing arrived first (recorded at 09:00), sorting is a late event (recorded at 09:45)
-- but event_time shows SORTING logically happened first
('DB-WASH-005',  'BATCH-005', 'WASHING',  90, '2026-09-01 09:00:00+07', 'OP-2', 'LINE-A', 'washing entered before sorting confirmed'),
('DB-SORT-005',  'BATCH-005', 'SORTING',  90, '2026-09-01 07:50:00+07', 'OP-1', 'LINE-A', 'LATE: sorting record entered retroactively'),

-- ── BATCH-006 (WO-003, LINE-A): in-progress at SORTING ───────────────────────
('DB-SORT-006',  'BATCH-006', 'SORTING',  75, '2026-09-01 13:00:00+07', 'OP-1', 'LINE-A', NULL),

-- ── BATCH-007 (WO-003, LINE-A): MISSING SORTING — should show missing-data indicator
-- Has WASHING but no SORTING; a later-station event places it IN_PROGRESS
('DB-WASH-007',  'BATCH-007', 'WASHING',  50, '2026-09-01 14:00:00+07', 'OP-2', 'LINE-A', NULL)

-- ── BATCH-008 (WO-002, LINE-B): PLANNED — no events, only exists in WO master
-- (no rows here — batch 008 only appears in the API fixture work order)

ON CONFLICT (source_record_id) DO NOTHING;
