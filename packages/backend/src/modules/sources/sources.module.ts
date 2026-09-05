import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from './entities/data-source.entity.js';
import { SourcesService } from './sources.service.js';
import { SourcesController } from './sources.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([DataSource])],
  providers: [SourcesService],
  controllers: [SourcesController],
  exports: [SourcesService],
})
export class SourcesModule {}
