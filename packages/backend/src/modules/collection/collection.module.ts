import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionRun } from './entities/collection-run.entity.js';
import { CollectionService } from './collection.service.js';
import { CollectionController } from './collection.controller.js';
import { ApiCollector } from './collectors/api.collector.js';
import { CrawlerCollector } from './collectors/crawler.collector.js';
import { DatabaseCollector } from './collectors/database.collector.js';
import { SourcesModule } from '../sources/sources.module.js';
import { NormalizationModule } from '../normalization/normalization.module.js';
import { ManagementModule } from '../management/management.module.js';
import { MqttModule } from '../mqtt/mqtt.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectionRun]),
    SourcesModule,
    NormalizationModule,
    ManagementModule,
    MqttModule,
  ],
  providers: [
    CollectionService,
    ApiCollector,
    CrawlerCollector,
    DatabaseCollector,
  ],
  controllers: [CollectionController],
  exports: [CollectionService],
})
export class CollectionModule {}
