import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ManagementService } from './management.service.js';
import { ManagementEvent, ManagementEventType } from './entities/management-event.entity.js';
import { Repository } from 'typeorm';

describe('ManagementService', () => {
  let service: ManagementService;
  let repoMock: Partial<Repository<ManagementEvent>>;

  beforeEach(() => {
    repoMock = {
      create: vi.fn().mockImplementation((dto) => ({ ...dto, id: 'mgmt-1', createdAt: new Date() })),
      save: vi.fn().mockImplementation((e) => Promise.resolve(e)),
      find: vi.fn(),
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    service = new ManagementService(repoMock as Repository<ManagementEvent>);
  });

  describe('create', () => {
    it('should save an append-only management event with default actor and org', async () => {
      const result = await service.create({
        batchId: 'BATCH-001',
        eventType: ManagementEventType.BLOCK,
        note: 'Quality check failure',
      });

      expect(repoMock.create).toHaveBeenCalledWith({
        batchId: 'BATCH-001',
        eventType: ManagementEventType.BLOCK,
        actor: 'manager-1',
        organizationId: 'celesnity-org',
        note: 'Quality check failure',
      });
      expect(result.eventType).toBe(ManagementEventType.BLOCK);
    });

    it('should allow custom actor', async () => {
      const result = await service.create({
        batchId: 'BATCH-002',
        eventType: ManagementEventType.ACKNOWLEDGE,
        actor: 'supervisor-jane',
      });

      expect(repoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'supervisor-jane',
          eventType: ManagementEventType.ACKNOWLEDGE,
        })
      );
    });
  });

  describe('isBatchBlocked', () => {
    it('should return true if the latest event is a BLOCK', async () => {
      vi.spyOn(repoMock, 'findOne').mockResolvedValue({
        id: 'evt-1',
        batchId: 'BATCH-003',
        eventType: ManagementEventType.BLOCK,
        actor: 'manager-1',
        organizationId: 'celesnity-org',
        note: 'Dryer overheating',
        createdAt: new Date(),
      });

      const isBlocked = await service.isBatchBlocked('BATCH-003');
      expect(isBlocked).toBe(true);
    });

    it('should return false if the latest event is a RESUME', async () => {
      vi.spyOn(repoMock, 'findOne').mockResolvedValue({
        id: 'evt-2',
        batchId: 'BATCH-003',
        eventType: ManagementEventType.RESUME,
        actor: 'manager-1',
        organizationId: 'celesnity-org',
        note: 'Issue resolved',
        createdAt: new Date(),
      });

      const isBlocked = await service.isBatchBlocked('BATCH-003');
      expect(isBlocked).toBe(false);
    });

    it('should return false if no BLOCK/RESUME events exist', async () => {
      vi.spyOn(repoMock, 'findOne').mockResolvedValue(null);

      const isBlocked = await service.isBatchBlocked('BATCH-001');
      expect(isBlocked).toBe(false);
    });
  });

  describe('getBlockedBatchIds', () => {
    it('should correctly identify blocked batches in bulk', async () => {
      const qbMock: any = {
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          // BATCH-001: most recent is RESUME
          { batchId: 'BATCH-001', eventType: ManagementEventType.RESUME, createdAt: new Date('2026-09-01T10:00:00Z') },
          { batchId: 'BATCH-001', eventType: ManagementEventType.BLOCK, createdAt: new Date('2026-09-01T09:00:00Z') },
          // BATCH-002: most recent is BLOCK
          { batchId: 'BATCH-002', eventType: ManagementEventType.BLOCK, createdAt: new Date('2026-09-01T11:00:00Z') },
        ]),
      };
      vi.spyOn(repoMock, 'createQueryBuilder').mockReturnValue(qbMock);

      const blockedSet = await service.getBlockedBatchIds(['BATCH-001', 'BATCH-002', 'BATCH-003']);

      expect(blockedSet.has('BATCH-002')).toBe(true);
      expect(blockedSet.has('BATCH-001')).toBe(false);
      expect(blockedSet.has('BATCH-003')).toBe(false);
    });
  });

  describe('Dataset lifecycle', () => {
    it('should softDelete all active management events', async () => {
      vi.spyOn(repoMock, 'find').mockResolvedValue([{ id: 'm-1' }, { id: 'm-2' }] as any);
      repoMock.softDelete = vi.fn().mockResolvedValue({} as any);

      const res = await service.softDeleteAll();
      expect(repoMock.softDelete).toHaveBeenCalledWith(['m-1', 'm-2']);
      expect(res.affected).toBe(2);
    });

    it('should restore soft-deleted management events', async () => {
      vi.spyOn(repoMock, 'find').mockResolvedValue([
        { id: 'm-1', deletedAt: new Date() },
        { id: 'm-2', deletedAt: null },
      ] as any);
      repoMock.restore = vi.fn().mockResolvedValue({} as any);

      const res = await service.restoreAll();
      expect(repoMock.restore).toHaveBeenCalledWith(['m-1']);
      expect(res.affected).toBe(1);
    });

    it('should purge all management events permanently', async () => {
      repoMock.count = vi.fn().mockResolvedValue(5);
      const qbMock: any = {
        delete: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 5 }),
      };
      vi.spyOn(repoMock, 'createQueryBuilder').mockReturnValue(qbMock);

      const res = await service.purgeAll();
      expect(res.affected).toBe(5);
    });
  });
});
