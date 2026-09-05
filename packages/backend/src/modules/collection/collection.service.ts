import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CollectionRun, CollectionError } from './entities/collection-run.entity.js';
import { CollectionStatus } from '../../common/enums/status.enum.js';
import { SourceType } from '../../common/enums/source-type.enum.js';
import { SourcesService } from '../sources/sources.service.js';
import { ApiCollector } from './collectors/api.collector.js';
import { CrawlerCollector } from './collectors/crawler.collector.js';
import { DatabaseCollector } from './collectors/database.collector.js';
import { NormalizationService } from '../normalization/normalization.service.js';
import { MqttCollector } from '../mqtt/mqtt.collector.js';
import { decryptObject } from '../../common/utils/crypto.util.js';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource as OrmDataSource } from 'typeorm';

interface DatabaseCredentials {
  password: string;
}

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(
    @InjectRepository(CollectionRun)
    private readonly runRepo: Repository<CollectionRun>,

    @InjectDataSource()
    private readonly ormDs: OrmDataSource,

    private readonly sourcesService: SourcesService,
    private readonly apiCollector: ApiCollector,
    private readonly crawlerCollector: CrawlerCollector,
    private readonly dbCollector: DatabaseCollector,
    private readonly normalization: NormalizationService,
    private readonly mqttCollector: MqttCollector,
  ) { }

  /** List all collection runs for a source, newest first */
  async findRunsForSource(sourceId: string, page = 1, limit = 20) {
    const [data, total] = await this.runRepo.findAndCount({
      where: { sourceId },
      order: { startedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  /** List all collection runs globally */
  async findAllRuns(page = 1, limit = 20) {
    const [data, total] = await this.runRepo.findAndCount({
      order: { startedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  /** Get a specific run by id */
  async findRun(runId: string): Promise<CollectionRun> {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Collection run ${runId} not found`);
    return run;
  }

  /**
   * Trigger a manual collection run for a source.
   * Returns immediately with the run record — actual collection is awaited.
   */
  async triggerCollection(sourceId: string): Promise<CollectionRun> {
    // Fetch with credentials (select: true override via raw query)
    const source = await this.ormDs
      .getRepository('data_sources')
      .createQueryBuilder('s')
      .addSelect('s.encryptedCredentials')
      .where('s.id = :id', { id: sourceId })
      .getRawOne<{
        s_id: string; s_type: string; s_config: string;
        s_selectedTarget: string | null;
        s_encryptedCredentials: string | null;
        s_isActive: boolean;
      }>();

    if (!source) throw new NotFoundException(`Data source ${sourceId} not found`);
    if (!source.s_isActive) {
      throw new BadRequestException(`Data source ${sourceId} is inactive`);
    }
    if (!source.s_selectedTarget && (source.s_type as SourceType) !== SourceType.MQTT) {
      throw new BadRequestException(
        `Data source ${sourceId} has no selectedTarget. ` +
        `Use PATCH /sources/${sourceId} to set selectedTarget before collecting.`
      );
    }
    const target = source.s_selectedTarget || 'factory/line/+/station/+/batch/+';

    const run = await this.runRepo.save(
      this.runRepo.create({
        sourceId,
        sourceType: source.s_type as SourceType,
        status: CollectionStatus.RUNNING,
        startedAt: new Date(),
      })
    );

    const configObj =
      typeof source.s_config === 'string'
        ? JSON.parse(source.s_config)
        : (source.s_config as Record<string, unknown>) || {};

    // Run collection asynchronously (fire-and-forget from the HTTP response perspective)
    this.executeCollection(
      run,
      source.s_type as SourceType,
      configObj,
      target,
      source.s_encryptedCredentials,
    ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[CollectionService] Unhandled error in run ${run.id}: ${msg}`);
    });

    return run;
  }

  /** Start continuous MQTT telemetry stream for an MQTT source */
  async startMqttStream(sourceId: string): Promise<{ isStreaming: boolean; message: string }> {
    const source = await this.sourcesService.findOne(sourceId);
    if (!source) throw new NotFoundException(`Data source ${sourceId} not found`);
    if (source.type !== SourceType.MQTT) {
      throw new BadRequestException(`Source ${source.name} is not an MQTT stream source`);
    }

    const config = (source.config as Record<string, unknown>) || {};
    const brokerUrl = config['brokerUrl'] as string | undefined;
    let topic = (source.selectedTarget || config['topicPattern']) as string | undefined;

    // Fallback to standard telemetry pattern if selectedTarget is missing or non-MQTT target
    if (!topic || !topic.includes('/') || topic === 'production_events' || topic === '/receiving') {
      topic = (config['topicPattern'] as string) || 'factory/line/+/station/+/batch/+';
    }

    this.mqttCollector.startClient(brokerUrl, topic);

    await this.ormDs
      .getRepository('data_sources')
      .update(sourceId, { lastCollectedAt: new Date(), selectedTarget: topic });

    return {
      isStreaming: true,
      message: `MQTT stream listener connected to ${brokerUrl || 'configured broker'}. Ingesting real-time telemetry.`,
    };
  }

  /** Stop continuous MQTT telemetry stream */
  async stopMqttStream(sourceId?: string): Promise<{ isStreaming: boolean; message: string }> {
    this.mqttCollector.stopClient();
    return {
      isStreaming: false,
      message: `MQTT stream listener stopped.`,
    };
  }

  /** Get MQTT status */
  getMqttStatus() {
    return this.mqttCollector.getStatus();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async executeCollection(
    run: CollectionRun,
    type: SourceType,
    config: Record<string, unknown>,
    target: string,
    encryptedCredentials: string | null,
  ): Promise<void> {
    const startMs = Date.now();
    const collectionErrors: CollectionError[] = [];
    let recordsCollected = 0;
    let recordsFailed = 0;

    try {
      if (type === SourceType.API) {
        const baseUrl = config['baseUrl'] as string;
        const { records, errors } = await this.apiCollector.collect(baseUrl, target);
        recordsFailed += errors.length;
        collectionErrors.push(
          ...errors.map((e) => ({ timestamp: new Date().toISOString(), ...e }))
        );

        if (records.length > 0) {
          const { saved, duplicates, conflicts } =
            await this.normalization.normalizeApiRecords(records, run.id);
          recordsCollected = saved + duplicates + conflicts;
          this.logger.log(
            `[CollectionService] API run ${run.id}: saved=${saved}, dup=${duplicates}, conflict=${conflicts}`
          );
        }
      }

      else if (type === SourceType.CRAWLER) {
        const startUrl = target;
        const { records, errors } = await this.crawlerCollector.collect(startUrl);
        recordsFailed += errors.length;
        collectionErrors.push(
          ...errors.map((e) => ({ timestamp: new Date().toISOString(), ...e }))
        );

        if (records.length > 0) {
          const { saved, duplicates, conflicts } =
            await this.normalization.normalizeCrawlerRecords(records, run.id);
          recordsCollected = saved + duplicates + conflicts;
          this.logger.log(
            `[CollectionService] Crawler run ${run.id}: saved=${saved}, dup=${duplicates}, conflict=${conflicts}`
          );
        }
      }

      else if (type === SourceType.DATABASE) {
        const cfg = config as { host: string; port: string; database: string; username: string };
        const { records, errors } = await this.dbCollector.collect(
          cfg,
          encryptedCredentials,
          target,
        );
        recordsFailed += errors.length;
        collectionErrors.push(
          ...errors.map((e) => ({ timestamp: new Date().toISOString(), ...e }))
        );

        if (records.length > 0) {
          const { saved, duplicates, conflicts } =
            await this.normalization.normalizeDbRecords(records, run.id);
          recordsCollected = saved + duplicates + conflicts;
          this.logger.log(
            `[CollectionService] DB run ${run.id}: saved=${saved}, dup=${duplicates}, conflict=${conflicts}`
          );
        }
      }

      else if (type === SourceType.MQTT) {
        // MQTT operates as an event-driven continuous stream listener.
        const recentCount = await this.ormDs
          .getRepository('canonical_events')
          .count({ where: { sourceType: SourceType.MQTT } });
        recordsCollected = recentCount;
        this.logger.log(
          `[CollectionService] MQTT stream run ${run.id}: active continuous listener (${recentCount} telemetry events currently ingested)`
        );
      }

      else {
        throw new Error(`Collection not implemented for source type: ${type}`);
      }

      const finalStatus =
        recordsFailed > 0 && recordsCollected === 0
          ? CollectionStatus.FAILED
          : recordsFailed > 0
            ? CollectionStatus.PARTIAL
            : CollectionStatus.COMPLETED;

      await this.runRepo.update(run.id, {
        status: finalStatus,
        completedAt: new Date(),
        durationMs: Date.now() - startMs,
        recordsCollected,
        recordsFailed,
        errors: collectionErrors.slice(0, 100), // cap errors stored
      });

      // Update source's lastCollectedAt
      await this.ormDs
        .createQueryBuilder()
        .update('data_sources')
        .set({ lastCollectedAt: new Date() })
        .where('id = :id', { id: run.sourceId })
        .execute();

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[CollectionService] Run ${run.id} failed: ${msg}`);
      collectionErrors.push({ timestamp: new Date().toISOString(), message: msg });
      await this.runRepo.update(run.id, {
        status: CollectionStatus.FAILED,
        completedAt: new Date(),
        durationMs: Date.now() - startMs,
        recordsCollected,
        recordsFailed: recordsFailed + 1,
        errors: collectionErrors.slice(0, 100),
      });
    }
  }
}
