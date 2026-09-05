import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanonicalEvent } from './entities/canonical-event.entity.js';
import { StationCode } from '../../common/enums/station-code.enum.js';
import { SourceType } from '../../common/enums/source-type.enum.js';
import { CanonicalEventStatus } from '../../common/enums/status.enum.js';
import { RawApiRecord } from '../collection/collectors/api.collector.js';
import { RawCrawlerRecord } from '../collection/collectors/crawler.collector.js';
import { RawDbRecord } from '../collection/collectors/database.collector.js';

/**
 * Batch master data cached from the API for workOrderId/lineId joining.
 * This is loaded once per normalization run from the API master data in canonical events.
 */
interface BatchMasterEntry {
  workOrderId: string;
  lineId: string;
}

export interface RawMqttTelemetry {
  batchId: string;
  stationCode: string;
  sourceRecordId: string;
  timestamp?: string;
  lineId?: string;
  [key: string]: any;
}

/**
 * Source priority for conflict resolution.
 * Higher number = higher priority (wins in a conflict).
 */
const SOURCE_PRIORITY: Record<SourceType, number> = {
  [SourceType.DATABASE]: 3,
  [SourceType.API]: 2,
  [SourceType.CRAWLER]: 1,
  [SourceType.MQTT]: 1,
};

/**
 * Normalization pipeline: transforms raw source records into CanonicalEvents.
 *
 * Dedup policy (deterministic):
 *   A record is DUPLICATE if (sourceType, sourceRecordId) already exists in the table.
 *   Duplicates are preserved with status=DUPLICATE for audit.
 *
 * Conflict policy:
 *   If (batchId, stationCode) already has an ACCEPTED record from a different source,
 *   the new record from a lower-priority source gets status=CONFLICT.
 *   The higher-priority source's record wins.
 */
@Injectable()
export class NormalizationService {
  private readonly logger = new Logger(NormalizationService.name);

  constructor(
    @InjectRepository(CanonicalEvent)
    private readonly repo: Repository<CanonicalEvent>,
  ) { }

  private dynamicBatchMaster: Map<string, BatchMasterEntry> = new Map();
  private dynamicWorkOrders: Map<string, { lineId: string; description?: string }> = new Map();

  // ── Public API ──────────────────────────────────────────────────────────────

  async normalizeApiRecords(
    records: RawApiRecord[],
    collectionRunId: string,
  ): Promise<{ saved: number; duplicates: number; conflicts: number }> {
    const batchMaster = await this.loadBatchMaster();
    let saved = 0, duplicates = 0, conflicts = 0;

    for (const rec of records) {
      // Dynamic master data ingestion for /batches and /work-orders
      if (rec.endpoint === '/batches') {
        const p = rec.payload;
        const batchId = (p['id'] as string) || (p['batchId'] as string);
        const workOrderId = p['workOrderId'] as string;
        const lineId = p['lineId'] as string;
        if (batchId && workOrderId && lineId) {
          this.dynamicBatchMaster.set(batchId, { workOrderId, lineId });
          this.logger.log(`[MasterRegistry] Synced batch master: ${batchId} -> ${workOrderId} (${lineId})`);
          saved++;
        }
        continue;
      }

      if (rec.endpoint === '/work-orders') {
        const p = rec.payload;
        const woId = (p['id'] as string) || (p['workOrderId'] as string);
        const lineId = p['lineId'] as string;
        if (woId && lineId) {
          this.dynamicWorkOrders.set(woId, { lineId, description: p['description'] as string });
          this.logger.log(`[MasterRegistry] Synced work order master: ${woId} (${lineId})`);
          saved++;
        }
        continue;
      }

      const mapped = this.mapApiRecord(rec, batchMaster);
      if (!mapped) continue;
      const result = await this.saveEvent({ ...mapped, collectionRunId });
      if (result === 'saved') saved++;
      else if (result === 'duplicate') duplicates++;
      else conflicts++;
    }
    return { saved, duplicates, conflicts };
  }

  async normalizeCrawlerRecords(
    records: RawCrawlerRecord[],
    collectionRunId: string,
  ): Promise<{ saved: number; duplicates: number; conflicts: number }> {
    const batchMaster = await this.loadBatchMaster();
    let saved = 0, duplicates = 0, conflicts = 0;

    for (const rec of records) {
      const entry = batchMaster.get(rec.batchId);
      const event = this.repo.create({
        batchId: rec.batchId,
        workOrderId: entry?.workOrderId ?? null,
        lineId: entry?.lineId ?? null,
        stationCode: StationCode.RECEIVING,
        quantity: rec.quantity,
        eventTime: new Date(rec.deliveryTime),
        sourceType: SourceType.CRAWLER,
        sourceRecordId: rec.sourceRecordId,
        collectionRunId,
        status: CanonicalEventStatus.ACCEPTED,
        rawPayload: rec as unknown as Record<string, unknown>,
      });
      const result = await this.saveEvent(event);
      if (result === 'saved') saved++;
      else if (result === 'duplicate') duplicates++;
      else conflicts++;
    }
    return { saved, duplicates, conflicts };
  }

  async normalizeDbRecords(
    records: RawDbRecord[],
    collectionRunId: string,
  ): Promise<{ saved: number; duplicates: number; conflicts: number }> {
    const batchMaster = await this.loadBatchMaster();
    let saved = 0, duplicates = 0, conflicts = 0;

    for (const rec of records) {
      const mapped = this.mapDbRecord(rec, batchMaster);
      if (!mapped) continue;
      const result = await this.saveEvent({ ...mapped, collectionRunId });
      if (result === 'saved') saved++;
      else if (result === 'duplicate') duplicates++;
      else conflicts++;
    }
    return { saved, duplicates, conflicts };
  }

  async normalizeMqttEvent(
    data: RawMqttTelemetry,
  ): Promise<'saved' | 'duplicate' | 'conflict' | 'skipped'> {
    if (!data.batchId || !data.stationCode || !data.sourceRecordId) {
      return 'skipped';
    }

    const batchMaster = await this.loadBatchMaster();
    const entry = batchMaster.get(data.batchId);

    const eventTime = data.timestamp ? new Date(data.timestamp) : new Date();
    const workOrderId = entry?.workOrderId ?? null;
    const lineId = data.lineId ?? entry?.lineId ?? null;

    const event: Partial<CanonicalEvent> & { collectionRunId?: string | null } = {
      batchId: data.batchId,
      workOrderId,
      lineId,
      stationCode: data.stationCode as StationCode,
      quantity: 1,
      eventTime,
      sourceType: SourceType.MQTT,
      sourceRecordId: data.sourceRecordId,
      collectionRunId: null,
      status: CanonicalEventStatus.ACCEPTED,
      rawPayload: data,
    };

    return this.saveEvent(event);
  }

  // ── Mapping helpers ─────────────────────────────────────────────────────────

  private mapApiRecord(
    rec: RawApiRecord,
    batchMaster: Map<string, BatchMasterEntry>,
  ): Partial<CanonicalEvent> | null {
    const p = rec.payload;

    // Only normalize station-relevant endpoints
    if (rec.endpoint === '/receiving') {
      const batchId = p['batchId'] as string;
      const entry = batchMaster.get(batchId);
      return {
        batchId,
        workOrderId: entry?.workOrderId ?? null,
        lineId: entry?.lineId ?? null,
        stationCode: StationCode.RECEIVING,
        quantity: p['quantity'] as number,
        eventTime: new Date(p['receivedAt'] as string),
        sourceType: SourceType.API,
        sourceRecordId: rec.sourceRecordId,
        status: CanonicalEventStatus.ACCEPTED,
        rawPayload: p,
      };
    }

    if (rec.endpoint === '/dispatch') {
      const batchId = p['batchId'] as string;
      const entry = batchMaster.get(batchId);
      return {
        batchId,
        workOrderId: entry?.workOrderId ?? null,
        lineId: entry?.lineId ?? null,
        stationCode: StationCode.DISPATCH,
        quantity: p['quantity'] as number,
        eventTime: new Date(p['dispatchedAt'] as string),
        sourceType: SourceType.API,
        sourceRecordId: rec.sourceRecordId,
        status: CanonicalEventStatus.ACCEPTED,
        rawPayload: p,
      };
    }

    // /batches and /work-orders are master data — not production events
    return null;
  }

  private mapDbRecord(
    rec: RawDbRecord,
    batchMaster: Map<string, BatchMasterEntry>,
  ): Partial<CanonicalEvent> | null {
    const p = rec.payload;
    const stationCode = p['station_code'] as string | undefined;
    if (!stationCode || !Object.values(StationCode).includes(stationCode as StationCode)) {
      this.logger.warn(`[Normalization] Unknown station_code "${stationCode}" — skipping`);
      return null;
    }

    const batchId = p['batch_id'] as string;
    const entry = batchMaster.get(batchId);

    return {
      batchId,
      workOrderId: (p['work_order_id'] as string | undefined) ?? entry?.workOrderId ?? null,
      lineId: (p['line_id'] as string | undefined) ?? entry?.lineId ?? null,
      stationCode: stationCode as StationCode,
      quantity: p['quantity'] as number,
      eventTime: new Date(p['event_time'] as string),
      sourceType: SourceType.DATABASE,
      sourceRecordId: rec.sourceRecordId,
      status: CanonicalEventStatus.ACCEPTED,
      rawPayload: p,
    };
  }

  // ── Dedup & conflict logic ──────────────────────────────────────────────────

  private async saveEvent(
    partial: Partial<CanonicalEvent> & { collectionRunId?: string | null },
  ): Promise<'saved' | 'duplicate' | 'conflict'> {
    // Dedup check: same (sourceType, sourceRecordId) already in DB
    const existing = await this.repo.findOne({
      where: { sourceType: partial.sourceType, sourceRecordId: partial.sourceRecordId },
    });
    if (existing) {
      // Preserve the duplicate for audit
      const dup = this.repo.create({
        ...partial,
        status: CanonicalEventStatus.DUPLICATE,
      });
      await this.repo.save(dup);
      this.logger.debug(
        `[Normalization] Duplicate: ${partial.sourceType}/${partial.sourceRecordId}`
      );
      return 'duplicate';
    }

    // Conflict check: same (batchId, stationCode) already accepted from a different source
    const accepted = await this.repo.findOne({
      where: {
        batchId: partial.batchId,
        stationCode: partial.stationCode,
        status: CanonicalEventStatus.ACCEPTED,
      },
    });
    if (accepted && accepted.sourceType !== partial.sourceType) {
      const incomingPriority = SOURCE_PRIORITY[partial.sourceType!] ?? 0;
      const existingPriority = SOURCE_PRIORITY[accepted.sourceType] ?? 0;

      if (incomingPriority > existingPriority) {
        // Incoming wins — demote existing to CONFLICT
        accepted.status = CanonicalEventStatus.CONFLICT;
        await this.repo.save(accepted);
        const winner = this.repo.create({ ...partial, status: CanonicalEventStatus.ACCEPTED });
        await this.repo.save(winner);
        this.logger.debug(
          `[Normalization] Conflict resolved: ${partial.sourceType} wins over ${accepted.sourceType} ` +
          `for batch=${partial.batchId} station=${partial.stationCode}`
        );
      } else {
        // Existing wins — save incoming as CONFLICT
        const conflict = this.repo.create({ ...partial, status: CanonicalEventStatus.CONFLICT });
        await this.repo.save(conflict);
        this.logger.debug(
          `[Normalization] Conflict: ${partial.sourceType} loses to ${accepted.sourceType} ` +
          `for batch=${partial.batchId} station=${partial.stationCode}`
        );
      }
      return 'conflict';
    }

    const event = this.repo.create({ ...partial, status: CanonicalEventStatus.ACCEPTED });
    await this.repo.save(event);
    return 'saved';
  }

  // ── Batch master data ───────────────────────────────────────────────────────

  public static readonly DEFAULT_BATCH_MASTER: Record<string, BatchMasterEntry> = {
    'BATCH-001': { workOrderId: 'WO-001', lineId: 'LINE-A' },
    'BATCH-002': { workOrderId: 'WO-001', lineId: 'LINE-A' },
    'BATCH-003': { workOrderId: 'WO-002', lineId: 'LINE-B' },
    'BATCH-004': { workOrderId: 'WO-002', lineId: 'LINE-B' },
    'BATCH-005': { workOrderId: 'WO-003', lineId: 'LINE-A' },
    'BATCH-006': { workOrderId: 'WO-003', lineId: 'LINE-A' },
    'BATCH-007': { workOrderId: 'WO-003', lineId: 'LINE-A' },
    'BATCH-008': { workOrderId: 'WO-003', lineId: 'LINE-A' },
  };

  /**
   * Build a batchId→{workOrderId, lineId} lookup with built-in master data
   * supplemented by existing canonical events.
   */
  private async loadBatchMaster(): Promise<Map<string, BatchMasterEntry>> {
    const map = new Map<string, BatchMasterEntry>(
      Object.entries(NormalizationService.DEFAULT_BATCH_MASTER)
    );

    // Dynamic in-memory entries loaded from /batches & /work-orders
    for (const [k, v] of this.dynamicBatchMaster.entries()) {
      map.set(k, v);
    }

    // Pull distinct (batchId, workOrderId, lineId) triples from events
    const rows = await this.repo
      .createQueryBuilder('e')
      .distinct(true)
      .select(['e.batchId', 'e.workOrderId', 'e.lineId'])
      .where('e.workOrderId IS NOT NULL')
      .andWhere('e.lineId IS NOT NULL')
      .getRawMany<{ e_batchId: string; e_workOrderId: string; e_lineId: string }>();

    for (const row of rows) {
      map.set(row.e_batchId, {
        workOrderId: row.e_workOrderId,
        lineId: row.e_lineId,
      });
    }
    return map;
  }

  /** Public query: paginated canonical events with provenance info */
  async findAll(page = 1, limit = 50, batchId?: string) {
    const qb = this.repo
      .createQueryBuilder('e')
      .orderBy('e.eventTime', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (batchId) qb.andWhere('e.batchId = :batchId', { batchId });

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /** Soft-delete all canonical events (sets deletedAt timestamp) */
  async softDeleteAll(): Promise<{ affected: number }> {
    const activeEvents = await this.repo.find({ select: ['id'] });
    if (activeEvents.length === 0) {
      return { affected: 0 };
    }
    const ids = activeEvents.map((e) => e.id);
    await this.repo.softDelete(ids);
    this.logger.log(`[Normalization] Soft-deleted ${ids.length} canonical events`);
    return { affected: ids.length };
  }

  /** Restore all soft-deleted canonical events */
  async restoreAll(): Promise<{ affected: number }> {
    const deletedEvents = await this.repo.find({
      withDeleted: true,
      select: ['id', 'deletedAt'],
    });
    const softDeleted = deletedEvents.filter((e) => e.deletedAt !== null);
    if (softDeleted.length === 0) {
      return { affected: 0 };
    }
    const ids = softDeleted.map((e) => e.id);
    await this.repo.restore(ids);
    this.logger.log(`[Normalization] Restored ${ids.length} canonical events`);
    return { affected: ids.length };
  }

  /** Hard-delete / purge all canonical events permanently */
  async purgeAll(): Promise<{ affected: number }> {
    const totalCount = await this.repo.count({ withDeleted: true });
    await this.repo.createQueryBuilder().delete().from(CanonicalEvent).execute();
    this.logger.log(`[Normalization] Purged ${totalCount} canonical events permanently`);
    return { affected: totalCount };
  }

  /** Get dataset statistics: active, soft-deleted, and total events */
  async getStats(): Promise<{ active: number; softDeleted: number; total: number }> {
    const all = await this.repo.find({ withDeleted: true, select: ['id', 'deletedAt'] });
    const softDeleted = all.filter((e) => e.deletedAt !== null).length;
    const active = all.length - softDeleted;
    return { active, softDeleted, total: all.length };
  }
}
