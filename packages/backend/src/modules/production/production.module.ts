import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanonicalEvent } from '../normalization/entities/canonical-event.entity.js';
import { ManagementModule } from '../management/management.module.js';
import { ProductionService } from './production.service.js';
import { ProductionController } from './production.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CanonicalEvent]),
    ManagementModule,
  ],
  providers: [ProductionService],
  controllers: [ProductionController],
  exports: [ProductionService],
})
export class ProductionModule {}
