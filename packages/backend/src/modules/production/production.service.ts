import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CanonicalEvent } from '../normalization/entities/canonical-event.entity.js';
import { ManagementService } from '../management/management.service.js';
import { StationCode, STATION_ORDER } from '../../common/enums/station-code.enum.js';
import { CanonicalEventStatus, BatchState } from '../../common/enums/status.enum.js';
import {
  BatchView,
  StationSummary,
  ProductionLineView,
  LineSummary,
  StationHistoryEntry,
  BatchIndicators,
} from './production.types.js';

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  /** Stale threshold in minutes — configurable via env, default 15 */
  private get staleThresholdMinutes(): number {
    return this.config.get<number>('STALE_THRESHOLD_MINUTES', 15);
  }

  constructor(
    @InjectRepository(CanonicalEvent)
    private readonly eventRepo: Repository<CanonicalEvent>,
    private readonly management: ManagementService,
    private readonly config: ConfigService,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /** All distinct lineIds with summary metrics */
  async getLineSummaries(): Promise<LineSummary[]> {
    const lineIds = await this.getDistinctLineIds();
    return Promise.all(lineIds.map((id) => this.buildLineSummary(id)));
  }

  /** Full line view: stations + batches */
  async getLineView(lineId: string): Promise<ProductionLineView> {
    const batches = await this.getBatchesForLine(lineId);
    const stations = this.computeStationSummaries(batches);

    const summary = {
      totalBatches: batches.length,
      completedBatches: batches.filter((b) => b.state === BatchState.COMPLETED).length,
      inProgressBatches: batches.filter((b) => b.state === BatchState.IN_PROGRESS).length,
      blockedBatches: batches.filter((b) => b.state === BatchState.BLOCKED).length,
      plannedBatches: batches.filter((b) => b.state === BatchState.PLANNED).length,
      staleBatches: batches.filter((b) => b.indicators.isStale).length,
    };

    return { lineId, stations, batches, summary };
  }

  /** Full view of a single batch */
  async getBatchView(batchId: string): Promise<BatchView> {
    const events = await this.loadBatchEvents(batchId);
    const isBlocked = await this.management.isBatchBlocked(batchId);
    return this.computeBatchView(batchId, events, isBlocked);
  }

  /** All batches across all lines */
  async getAllBatches(): Promise<BatchView[]> {
    const allBatchIds = await this.getDistinctBatchIds();
    if (allBatchIds.length === 0) return [];

    const allEvents = await this.loadAllBatchEvents(allBatchIds);
    const blockedIds = await this.management.getBlockedBatchIds(allBatchIds);

    return allBatchIds.map((batchId) =>
      this.computeBatchView(batchId, allEvents.get(batchId) ?? [], blockedIds.has(batchId))
    );
  }

  // ── Core computation ────────────────────────────────────────────────────────

  /**
   * Full batch state machine + indicator computation.
   * Operates on pre-loaded CanonicalEvent rows for efficiency.
   */
  private computeBatchView(
    batchId: string,
    events: CanonicalEvent[],
    isBlocked: boolean,
  ): BatchView {
    // Separate ACCEPTED events for business logic from DUPLICATE/CONFLICT for audit
    const accepted = events.filter((e) => e.status === CanonicalEventStatus.ACCEPTED);
    const hasConflict = events.some((e) => e.status === CanonicalEventStatus.CONFLICT);

    // Derive metadata from first available event or fallback to master map
    const fallback = ProductionService.BATCH_LINE_MAP[batchId];
    const workOrderId = events.find((e) => e.workOrderId)?.workOrderId ?? fallback?.workOrderId ?? null;
    const lineId = events.find((e) => e.lineId)?.lineId ?? fallback?.lineId ?? null;

    // ── Current station: furthest ACCEPTED station in canonical order ──────
    const currentStation = this.computeCurrentStation(accepted);

    // ── State machine (evaluated in strict priority order) ─────────────────
    const state = this.computeBatchState(accepted, isBlocked);

    // ── Quantity: from current station's accepted event ─────────────────────
    const currentStationEvent = accepted.find((e) => e.stationCode === currentStation);
    const quantity = currentStationEvent?.quantity ?? 0;

    // ── Freshness ──────────────────────────────────────────────────────────
    const lastEventTime = this.computeLastEventTime(accepted);
    const dataFreshnessMinutes = lastEventTime
      ? (Date.now() - lastEventTime.getTime()) / 60_000
      : null;
    const isStale =
      dataFreshnessMinutes !== null && dataFreshnessMinutes > this.staleThresholdMinutes;

    // ── Missing data: later station exists but earlier has no ACCEPTED event ─
    const hasMissingData = this.checkMissingData(accepted);

    // ── Station history (all events including duplicates/conflicts) ─────────
    const stationHistory: StationHistoryEntry[] = events
      .slice()
      .sort((a, b) => a.eventTime.getTime() - b.eventTime.getTime())
      .map((e) => ({
        stationCode: e.stationCode,
        quantity: e.quantity,
        eventTime: e.eventTime,
        sourceType: e.sourceType,
        sourceRecordId: e.sourceRecordId,
        status: e.status,
        collectionRunId: e.collectionRunId,
      }));

    const indicators: BatchIndicators = { isStale, hasMissingData, hasConflict, isBlocked };

    return {
      batchId,
      workOrderId,
      lineId,
      state,
      currentStation,
      quantity,
      lastEventTime,
      dataFreshnessMinutes: dataFreshnessMinutes !== null ? Math.round(dataFreshnessMinutes) : null,
      indicators,
      stationHistory,
    };
  }

  /**
   * Batch State Machine — evaluated in strict priority order per spec:
   *   1. COMPLETED  — at least one ACCEPTED DISPATCH event
   *   2. BLOCKED    — no dispatch + active BLOCK management event
   *   3. IN_PROGRESS — no block/dispatch + at least one accepted event
   *   4. PLANNED    — no accepted events at all
   */
  private computeBatchState(
    acceptedEvents: CanonicalEvent[],
    isBlocked: boolean,
  ): BatchState {
    if (acceptedEvents.some((e) => e.stationCode === StationCode.DISPATCH)) {
      return BatchState.COMPLETED;
    }
    if (isBlocked) {
      return BatchState.BLOCKED;
    }
    if (acceptedEvents.length > 0) {
      return BatchState.IN_PROGRESS;
    }
    return BatchState.PLANNED;
  }

  /**
   * Current station = the furthest station reached in STATION_ORDER
   * by any ACCEPTED event.
   *
   * Late events from earlier stations update history but this value
   * can NEVER move backward — it always reflects the furthest point reached.
   */
  private computeCurrentStation(accepted: CanonicalEvent[]): StationCode | null {
    if (accepted.length === 0) return null;

    let maxIdx = -1;
    let result: StationCode | null = null;

    for (const event of accepted) {
      const idx = STATION_ORDER.indexOf(event.stationCode);
      if (idx > maxIdx) {
        maxIdx = idx;
        result = event.stationCode;
      }
    }
    return result;
  }

  /**
   * Last event time = most recent eventTime across all ACCEPTED events.
   * Uses eventTime (when event occurred) not createdAt (when collected).
   */
  private computeLastEventTime(accepted: CanonicalEvent[]): Date | null {
    if (accepted.length === 0) return null;
    return accepted.reduce(
      (latest, e) => (e.eventTime > latest ? e.eventTime : latest),
      accepted[0].eventTime,
    );
  }

  /**
   * Missing data indicator:
   * True when a later station has an ACCEPTED event but an earlier station
   * (between RECEIVING and the latest station) has no ACCEPTED event.
   *
   * Example: has WASHING but no SORTING → hasMissingData=true
   */
  private checkMissingData(accepted: CanonicalEvent[]): boolean {
    if (accepted.length === 0) return false;

    const presentStations = new Set(accepted.map((e) => e.stationCode));
    const maxIdx = Math.max(
      ...accepted.map((e) => STATION_ORDER.indexOf(e.stationCode))
    );

    // Check every station from index 0 up to maxIdx (exclusive of DISPATCH)
    for (let i = 0; i < maxIdx; i++) {
      const station = STATION_ORDER[i];
      // DISPATCH absence before max is fine (it's the last step, handled by state machine)
      if (station === StationCode.DISPATCH) continue;
      if (!presentStations.has(station)) {
        return true;
      }
    }
    return false;
  }

  // ── Station summary ─────────────────────────────────────────────────────────

  private computeStationSummaries(batches: BatchView[]): StationSummary[] {
    const now = Date.now();
    return STATION_ORDER.map((stationCode) => {
      // WIP = non-completed batches currently at this station
      // (For DISPATCH, count completed batches that reached final step)
      const isDispatch = stationCode === StationCode.DISPATCH;
      const wipBatches = batches.filter(
        (b) =>
          b.currentStation === stationCode &&
          b.state !== BatchState.COMPLETED,
      );
      const completedBatches = batches.filter((b) => b.state === BatchState.COMPLETED);
      const wip = isDispatch ? completedBatches.length : wipBatches.length;

      // completedQuantity = sum of quantities from accepted events at this station
      const allAtStation = batches.flatMap((b) =>
        b.stationHistory.filter(
          (h) => h.stationCode === stationCode && h.status === CanonicalEventStatus.ACCEPTED
        )
      );
      const completedQuantity = allAtStation.reduce((sum, h) => sum + h.quantity, 0);

      // Last event time for this station across all batches
      const times = allAtStation.map((h) => h.eventTime.getTime());
      const lastMs = times.length > 0 ? Math.max(...times) : null;
      const lastEventTime = lastMs ? new Date(lastMs) : null;
      const freshnessMinutes = lastMs !== null ? (now - lastMs) / 60_000 : null;
      const isStale = freshnessMinutes !== null && freshnessMinutes > this.staleThresholdMinutes;

      return {
        stationCode,
        wip,
        completedQuantity,
        lastEventTime,
        dataFreshnessMinutes: freshnessMinutes !== null ? Math.round(freshnessMinutes) : null,
        isStale,
      };
    });
  }

  // ── Line summary helper ─────────────────────────────────────────────────────

  private async buildLineSummary(lineId: string): Promise<LineSummary> {
    const batches = await this.getBatchesForLine(lineId);
    const stations = this.computeStationSummaries(batches);
    return {
      lineId,
      stations,
      totalBatches: batches.length,
      completedBatches: batches.filter((b) => b.state === BatchState.COMPLETED).length,
      inProgressBatches: batches.filter((b) => b.state === BatchState.IN_PROGRESS).length,
      blockedBatches: batches.filter((b) => b.state === BatchState.BLOCKED).length,
      plannedBatches: batches.filter((b) => b.state === BatchState.PLANNED).length,
      staleBatches: batches.filter((b) => b.indicators.isStale).length,
    };
  }

  private async getBatchesForLine(lineId: string): Promise<BatchView[]> {
    const batchIds = await this.getDistinctBatchIdsForLine(lineId);
    if (batchIds.length === 0) return [];

    const allEvents = await this.loadAllBatchEvents(batchIds);
    const blockedIds = await this.management.getBlockedBatchIds(batchIds);

    return batchIds.map((batchId) =>
      this.computeBatchView(batchId, allEvents.get(batchId) ?? [], blockedIds.has(batchId))
    );
  }

  // ── DB queries & Master Mapping ───────────────────────────────────────────

  private static readonly BATCH_LINE_MAP: Record<string, { lineId: string; workOrderId: string }> = {
    'BATCH-001': { lineId: 'LINE-A', workOrderId: 'WO-001' },
    'BATCH-002': { lineId: 'LINE-A', workOrderId: 'WO-001' },
    'BATCH-003': { lineId: 'LINE-B', workOrderId: 'WO-002' },
    'BATCH-004': { lineId: 'LINE-B', workOrderId: 'WO-002' },
    'BATCH-005': { lineId: 'LINE-A', workOrderId: 'WO-003' },
    'BATCH-006': { lineId: 'LINE-A', workOrderId: 'WO-003' },
    'BATCH-007': { lineId: 'LINE-A', workOrderId: 'WO-003' },
    'BATCH-008': { lineId: 'LINE-A', workOrderId: 'WO-003' },
  };

  private async getDistinctLineIds(): Promise<string[]> {
    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .distinct(true)
      .select('e.lineId', 'lineId')
      .where('e.lineId IS NOT NULL')
      .getRawMany<{ lineId: string }>();
    const found = rows.map((r) => r.lineId).filter(Boolean);
    return Array.from(new Set(['LINE-A', 'LINE-B', ...found])).sort();
  }

  private async getDistinctBatchIds(): Promise<string[]> {
    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .distinct(true)
      .select('e.batchId', 'batchId')
      .getRawMany<{ batchId: string }>();
    return rows.map((r) => r.batchId).sort();
  }

  private async getDistinctBatchIdsForLine(lineId: string): Promise<string[]> {
    const rows = await this.eventRepo
      .createQueryBuilder('e')
      .distinct(true)
      .select('e.batchId', 'batchId')
      .getRawMany<{ batchId: string }>();
    
    const allBatches = rows.map((r) => r.batchId);
    return allBatches
      .filter((batchId) => {
        const mapped = ProductionService.BATCH_LINE_MAP[batchId];
        return mapped ? mapped.lineId === lineId : true;
      })
      .sort();
  }

  private async loadBatchEvents(batchId: string): Promise<CanonicalEvent[]> {
    return this.eventRepo.find({
      where: { batchId },
      order: { eventTime: 'ASC' },
    });
  }

  /**
   * Efficient bulk load: single query for all batchIds, then group in memory.
   * Avoids N+1 query problem.
   */
  private async loadAllBatchEvents(
    batchIds: string[],
  ): Promise<Map<string, CanonicalEvent[]>> {
    const events = await this.eventRepo
      .createQueryBuilder('e')
      .where('e.batchId IN (:...batchIds)', { batchIds })
      .orderBy('e.eventTime', 'ASC')
      .getMany();

    const map = new Map<string, CanonicalEvent[]>();
    for (const event of events) {
      if (!map.has(event.batchId)) map.set(event.batchId, []);
      map.get(event.batchId)!.push(event);
    }
    return map;
  }
}
