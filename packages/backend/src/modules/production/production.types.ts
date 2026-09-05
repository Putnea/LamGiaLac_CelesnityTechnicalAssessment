import { StationCode, STATION_ORDER } from '../../common/enums/station-code.enum.js';
import { SourceType } from '../../common/enums/source-type.enum.js';
import { CanonicalEventStatus, BatchState } from '../../common/enums/status.enum.js';

// ── View types exposed by the production service ────────────────────────────

export interface StationHistoryEntry {
  stationCode: StationCode;
  quantity: number;
  eventTime: Date;
  sourceType: SourceType;
  sourceRecordId: string;
  status: CanonicalEventStatus;
  collectionRunId: string | null;
}

export interface BatchIndicators {
  isStale: boolean;           // freshness > stale threshold
  hasMissingData: boolean;    // later station exists but earlier station has no ACCEPTED event
  hasConflict: boolean;       // any CONFLICT status events for this batch
  isBlocked: boolean;         // active BLOCK management event
}

export interface BatchView {
  batchId: string;
  workOrderId: string | null;
  lineId: string | null;
  state: BatchState;
  currentStation: StationCode | null; // furthest ACCEPTED station reached
  quantity: number;                   // quantity at current station
  lastEventTime: Date | null;
  dataFreshnessMinutes: number | null;
  indicators: BatchIndicators;
  stationHistory: StationHistoryEntry[];
}

export interface StationSummary {
  stationCode: StationCode;
  wip: number;                 // batches whose current station = this, not yet dispatched
  completedQuantity: number;   // sum of ACCEPTED quantities at this station (deduped)
  lastEventTime: Date | null;
  dataFreshnessMinutes: number | null;
  isStale: boolean;
}

export interface LineSummary {
  lineId: string;
  stations: StationSummary[];
  totalBatches: number;
  completedBatches: number;
  inProgressBatches: number;
  blockedBatches: number;
  plannedBatches: number;
  staleBatches: number;
}

export interface ProductionLineView {
  lineId: string;
  stations: StationSummary[];
  batches: BatchView[];
  summary: {
    totalBatches: number;
    completedBatches: number;
    inProgressBatches: number;
    blockedBatches: number;
    plannedBatches: number;
    staleBatches: number;
  };
}
