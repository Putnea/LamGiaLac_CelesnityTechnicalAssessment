import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourcesService } from './sources.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SourceType } from '../../common/enums/source-type.enum.js';

describe('SourcesService', () => {
  let service: SourcesService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((entity) => ({ id: 'new-id', ...entity })),
      save: vi.fn(async (entity) => entity),
      delete: vi.fn(),
    };

    service = new SourcesService(mockRepo);
  });

  describe('create', () => {
    it('should throw ConflictException if source with the same name already exists', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'existing-id', name: 'Existing API' });

      await expect(
        service.create({
          name: 'Existing API',
          type: SourceType.API,
          config: { baseUrl: 'http://localhost:3001' },
        })
      ).rejects.toThrow(ConflictException);

      await expect(
        service.create({
          name: 'Existing API',
          type: SourceType.API,
          config: { baseUrl: 'http://localhost:3001' },
        })
      ).rejects.toThrow('A data source named "Existing API" already exists. Please choose a unique name.');
    });

    it('should catch PostgreSQL unique constraint violation (code 23505) and throw ConflictException', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      mockRepo.save.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint' });

      await expect(
        service.create({
          name: 'Concurrent API',
          type: SourceType.API,
          config: { baseUrl: 'http://localhost:3001' },
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should create and save a new data source when name is unique', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.create({
        name: 'New Factory Source',
        type: SourceType.API,
        config: { baseUrl: 'http://localhost:3001' },
      });

      expect(mockRepo.create).toHaveBeenCalled();
      expect(mockRepo.save).toHaveBeenCalled();
      expect(result.name).toBe('New Factory Source');
    });
  });

  describe('update', () => {
    it('should throw ConflictException if updating to another existing source name', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce({ id: 'source-1', name: 'Source 1' }) // findOne(id)
        .mockResolvedValueOnce({ id: 'source-2', name: 'Source 2' }); // findOne(name)

      await expect(
        service.update('source-1', {
          name: 'Source 2',
        })
      ).rejects.toThrow(ConflictException);
    });
  });
});
