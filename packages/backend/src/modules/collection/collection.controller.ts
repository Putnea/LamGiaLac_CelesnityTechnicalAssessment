import { Controller, Get, Post, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { CollectionService } from './collection.service.js';
import { NormalizationService } from '../normalization/normalization.service.js';
import { ManagementService } from '../management/management.service.js';

@Controller()
export class CollectionController {
  constructor(
    private readonly collectionService: CollectionService,
    private readonly normalization: NormalizationService,
    private readonly management: ManagementService,
  ) {}

  /** Trigger a collection run for a source */
  @Post('sources/:sourceId/collect')
  triggerCollection(@Param('sourceId') sourceId: string) {
    return this.collectionService.triggerCollection(sourceId);
  }

  /** Start MQTT live stream */
  @Post('sources/:sourceId/start-stream')
  startStream(@Param('sourceId') sourceId: string) {
    return this.collectionService.startMqttStream(sourceId);
  }

  /** Stop MQTT live stream */
  @Post('sources/:sourceId/stop-stream')
  stopStream(@Param('sourceId') sourceId: string) {
    return this.collectionService.stopMqttStream(sourceId);
  }

  /** Get MQTT stream status */
  @Get('sources/mqtt/status')
  getMqttStatus() {
    return this.collectionService.getMqttStatus();
  }

  /** List collection runs for a source */
  @Get('sources/:sourceId/runs')
  getRunsForSource(
    @Param('sourceId') sourceId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.collectionService.findRunsForSource(sourceId, page, limit);
  }

  /** List all collection runs globally */
  @Get('runs')
  getAllRuns(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.collectionService.findAllRuns(page, limit);
  }

  /** Get a specific collection run by id */
  @Get('runs/:runId')
  getRun(@Param('runId') runId: string) {
    return this.collectionService.findRun(runId);
  }

  /** Preview normalised canonical events */
  @Get('events')
  getEvents(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('batchId') batchId?: string,
  ) {
    return this.normalization.findAll(page, limit, batchId);
  }

  /** Soft-delete all canonical events and management events */
  @Post('events/soft-delete-all')
  async softDeleteAllEvents() {
    const [canon, mgmt] = await Promise.all([
      this.normalization.softDeleteAll(),
      this.management.softDeleteAll(),
    ]);
    return { affected: (canon.affected ?? 0) + (mgmt.affected ?? 0) };
  }

  /** Restore all soft-deleted canonical events and management events */
  @Post('events/restore-all')
  async restoreAllEvents() {
    const [canon, mgmt] = await Promise.all([
      this.normalization.restoreAll(),
      this.management.restoreAll(),
    ]);
    return { affected: (canon.affected ?? 0) + (mgmt.affected ?? 0) };
  }

  /** Hard-delete / purge all canonical events and management events permanently */
  @Post('events/purge-all')
  async purgeAllEvents() {
    const [canon, mgmt] = await Promise.all([
      this.normalization.purgeAll(),
      this.management.purgeAll(),
    ]);
    return { affected: (canon.affected ?? 0) + (mgmt.affected ?? 0) };
  }

  /** Get aggregate dataset statistics (active, soft-deleted, total) */
  @Get('events/stats')
  async getEventStats() {
    const [canon, mgmt] = await Promise.all([
      this.normalization.getStats(),
      this.management.getStats(),
    ]);
    return {
      active: canon.active + mgmt.active,
      softDeleted: canon.softDeleted + mgmt.softDeleted,
      total: canon.total + mgmt.total,
    };
  }
}
