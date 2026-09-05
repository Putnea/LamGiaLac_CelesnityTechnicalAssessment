import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManagementEvent, ManagementEventType } from './entities/management-event.entity.js';
import { CreateManagementEventDto } from './dto/create-management-event.dto.js';

@Injectable()
export class ManagementService {
  constructor(
    @InjectRepository(ManagementEvent)
    private readonly repo: Repository<ManagementEvent>,
  ) {}

  async create(dto: CreateManagementEventDto): Promise<ManagementEvent> {
    const event = this.repo.create({
      batchId: dto.batchId,
      eventType: dto.eventType,
      actor: dto.actor ?? 'manager-1',
      organizationId: 'celesnity-org',
      note: dto.note ?? null,
    });
    return this.repo.save(event);
  }

  findForBatch(batchId: string): Promise<ManagementEvent[]> {
    return this.repo.find({
      where: { batchId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Determine if a batch is currently blocked.
   * A batch is blocked when the most recent BLOCK or RESUME event is a BLOCK.
   */
  async isBatchBlocked(batchId: string): Promise<boolean> {
    const latest = await this.repo.findOne({
      where: [
        { batchId, eventType: ManagementEventType.BLOCK },
        { batchId, eventType: ManagementEventType.RESUME },
      ],
      order: { createdAt: 'DESC' },
    });
    return latest?.eventType === ManagementEventType.BLOCK;
  }

  /**
   * Batch-fetch blocked status for multiple batchIds.
   * Returns a Set of batchIds that are currently blocked.
   */
  async getBlockedBatchIds(batchIds: string[]): Promise<Set<string>> {
    if (batchIds.length === 0) return new Set();

    // For each batchId, get the most recent BLOCK or RESUME event
    const events = await this.repo
      .createQueryBuilder('e')
      .where('e.batchId IN (:...batchIds)', { batchIds })
      .andWhere("e.eventType IN ('BLOCK', 'RESUME')")
      .orderBy('e.batchId', 'ASC')
      .addOrderBy('e.createdAt', 'DESC')
      .getMany();

    const blocked = new Set<string>();
    const seen = new Set<string>();

    for (const event of events) {
      if (seen.has(event.batchId)) continue; // already processed most recent
      seen.add(event.batchId);
      if (event.eventType === ManagementEventType.BLOCK) {
        blocked.add(event.batchId);
      }
    }

    return blocked;
  }

  /** Soft-delete all management events */
  async softDeleteAll(): Promise<{ affected: number }> {
    const active = await this.repo.find({ select: ['id'] });
    if (active.length === 0) return { affected: 0 };
    const ids = active.map((e) => e.id);
    await this.repo.softDelete(ids);
    return { affected: ids.length };
  }

  /** Restore all soft-deleted management events */
  async restoreAll(): Promise<{ affected: number }> {
    const deleted = await this.repo.find({
      withDeleted: true,
      select: ['id', 'deletedAt'],
    });
    const ids = deleted.filter((e) => e.deletedAt !== null).map((e) => e.id);
    if (ids.length === 0) return { affected: 0 };
    await this.repo.restore(ids);
    return { affected: ids.length };
  }

  /** Hard-delete / purge all management events permanently */
  async purgeAll(): Promise<{ affected: number }> {
    const count = await this.repo.count({ withDeleted: true });
    await this.repo.createQueryBuilder().delete().from(ManagementEvent).execute();
    return { affected: count };
  }

  /** Get management events dataset stats */
  async getStats(): Promise<{ active: number; softDeleted: number; total: number }> {
    const all = await this.repo.find({ withDeleted: true, select: ['id', 'deletedAt'] });
    const softDeleted = all.filter((e) => e.deletedAt !== null).length;
    const active = all.length - softDeleted;
    return { active, softDeleted, total: all.length };
  }
}
