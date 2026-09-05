import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProductionService } from './production.service.js';
import { CanonicalEvent } from '../normalization/entities/canonical-event.entity.js';
import { ManagementService } from '../management/management.service.js';
import { ConfigService } from '@nestjs/config';
import { StationCode } from '../../common/enums/station-code.enum.js';
import { SourceType } from '../../common/enums/source-type.enum.js';
import { CanonicalEventStatus, BatchState } from '../../common/enums/status.enum.js';
import { Repository } from 'typeorm';

describe('ProductionService & Batch State Machine', () => {
  let service: ProductionService;
  let eventRepoMock: Partial<Repository<CanonicalEvent>>;
  let managementMock: Partial<ManagementService>;
  let configMock: Partial<ConfigService>;

  beforeEach(() => {
    eventRepoMock = {
      find: vi.fn(),
      createQueryBuilder: vi.fn(),
    };
    managementMock = {
      isBatchBlocked: vi.fn().mockResolvedValue(false),
      getBlockedBatchIds: vi.fn().mockResolvedValue(new Set<string>()),
    };
    configMock = {
      get: vi.fn().mockImplementation((key: string, defaultVal: number) => {
        if (key === 'STALE_THRESHOLD_MINUTES') return 15;
        return defaultVal;
      }),
    };

    service = new ProductionService(
      eventRepoMock as Repository<CanonicalEvent>,
      managementMock as ManagementService,
      configMock as ConfigService,
    );
  });

  function createMockEvent(partial: Partial<CanonicalEvent>): CanonicalEvent {
    return {
      id: partial.id ?? 'evt-1',
      batchId: partial.batchId ?? 'BATCH-001',
      workOrderId: partial.workOrderId ?? 'WO-001',
      lineId: partial.lineId ?? 'LINE-A',
      stationCode: partial.stationCode ?? StationCode.RECEIVING,
      quantity: partial.quantity ?? 100,
      eventTime: partial.eventTime ?? new Date('2026-09-01T08:00:00Z'),
      sourceType: partial.sourceType ?? SourceType.API,
      sourceRecordId: partial.sourceRecordId ?? 'REC-001',
      collectionRunId: partial.collectionRunId ?? 'run-1',
      collectionRun: null as any,
      status: partial.status ?? CanonicalEventStatus.ACCEPTED,
      rawPayload: partial.rawPayload ?? {},
      createdAt: new Date(),
    };
  }

  describe('Batch State Machine', () => {
    it('should return PLANNED when no accepted events exist', async () => {
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue([]);
      const result = await service.getBatchView('BATCH-008');

      expect(result.state).toBe(BatchState.PLANNED);
      expect(result.currentStation).toBeNull();
      expect(result.quantity).toBe(0);
    });

    it('should return IN_PROGRESS when events from intermediate stations exist', async () => {
      const events = [
        createMockEvent({ stationCode: StationCode.RECEIVING, quantity: 120 }),
        createMockEvent({ stationCode: StationCode.SORTING, quantity: 120 }),
        createMockEvent({ stationCode: StationCode.WASHING, quantity: 120 }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);

      const result = await service.getBatchView('BATCH-001');

      expect(result.state).toBe(BatchState.IN_PROGRESS);
      expect(result.currentStation).toBe(StationCode.WASHING);
      expect(result.quantity).toBe(120);
    });

    it('should return COMPLETED when accepted DISPATCH event exists', async () => {
      const events = [
        createMockEvent({ stationCode: StationCode.RECEIVING, quantity: 120 }),
        createMockEvent({ stationCode: StationCode.SORTING, quantity: 120 }),
        createMockEvent({ stationCode: StationCode.WASHING, quantity: 120 }),
        createMockEvent({ stationCode: StationCode.DRYING, quantity: 120 }),
        createMockEvent({ stationCode: StationCode.FOLDING, quantity: 118 }),
        createMockEvent({ stationCode: StationCode.DISPATCH, quantity: 118 }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);

      const result = await service.getBatchView('BATCH-001');

      expect(result.state).toBe(BatchState.COMPLETED);
      expect(result.currentStation).toBe(StationCode.DISPATCH);
      expect(result.quantity).toBe(118);
    });

    it('should return BLOCKED when active manager block exists and not yet completed', async () => {
      const events = [
        createMockEvent({ stationCode: StationCode.RECEIVING, quantity: 60 }),
        createMockEvent({ stationCode: StationCode.SORTING, quantity: 60 }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);
      vi.spyOn(managementMock, 'isBatchBlocked').mockResolvedValue(true);

      const result = await service.getBatchView('BATCH-003');

      expect(result.state).toBe(BatchState.BLOCKED);
      expect(result.indicators.isBlocked).toBe(true);
    });
  });

  describe('Station Progress & Late Event Handling', () => {
    it('should never move batch backwards when late event arrives from earlier station', async () => {
      // WASHING arrived first at 09:00, then late SORTING arrived with timestamp 07:50
      const events = [
        createMockEvent({
          stationCode: StationCode.WASHING,
          quantity: 90,
          eventTime: new Date('2026-09-01T09:00:00Z'),
        }),
        createMockEvent({
          stationCode: StationCode.SORTING,
          quantity: 90,
          eventTime: new Date('2026-09-01T07:50:00Z'),
        }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);

      const result = await service.getBatchView('BATCH-005');

      // Furthest station reached is still WASHING (step 3), not SORTING (step 2)
      expect(result.currentStation).toBe(StationCode.WASHING);
      expect(result.stationHistory.length).toBe(2);
      // History sorted chronologically
      expect(result.stationHistory[0].stationCode).toBe(StationCode.SORTING);
      expect(result.stationHistory[1].stationCode).toBe(StationCode.WASHING);
    });
  });

  describe('Quality & Missing Data Indicators', () => {
    it('should flag hasMissingData when a station gap exists', async () => {
      // BATCH-007 has WASHING (step 3) but no SORTING (step 2)
      const events = [
        createMockEvent({ stationCode: StationCode.RECEIVING, quantity: 50 }),
        createMockEvent({ stationCode: StationCode.WASHING, quantity: 50 }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);

      const result = await service.getBatchView('BATCH-007');

      expect(result.indicators.hasMissingData).toBe(true);
    });

    it('should not flag hasMissingData when sequence is continuous', async () => {
      const events = [
        createMockEvent({ stationCode: StationCode.RECEIVING, quantity: 50 }),
        createMockEvent({ stationCode: StationCode.SORTING, quantity: 50 }),
        createMockEvent({ stationCode: StationCode.WASHING, quantity: 50 }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);

      const result = await service.getBatchView('BATCH-007');

      expect(result.indicators.hasMissingData).toBe(false);
    });

    it('should flag hasConflict when CONFLICT event is present in history', async () => {
      const events = [
        createMockEvent({
          stationCode: StationCode.RECEIVING,
          quantity: 100,
          status: CanonicalEventStatus.ACCEPTED,
        }),
        createMockEvent({
          stationCode: StationCode.RECEIVING,
          quantity: 80,
          status: CanonicalEventStatus.CONFLICT,
        }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);

      const result = await service.getBatchView('BATCH-004');

      expect(result.indicators.hasConflict).toBe(true);
    });
  });

  describe('Freshness & Staleness', () => {
    it('should flag isStale when lastEventTime exceeds threshold', async () => {
      // Event from 1 hour ago
      const oldTime = new Date(Date.now() - 60 * 60 * 1000);
      const events = [
        createMockEvent({ stationCode: StationCode.SORTING, quantity: 75, eventTime: oldTime }),
      ];
      vi.spyOn(eventRepoMock, 'find').mockResolvedValue(events);

      const result = await service.getBatchView('BATCH-006');

      expect(result.indicators.isStale).toBe(true);
      expect(result.dataFreshnessMinutes).toBeGreaterThanOrEqual(59);
    });
  });
});
