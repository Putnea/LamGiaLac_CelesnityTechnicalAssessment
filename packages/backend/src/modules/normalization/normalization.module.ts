import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanonicalEvent } from './entities/canonical-event.entity.js';
import { NormalizationService } from './normalization.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CanonicalEvent])],
  providers: [NormalizationService],
  exports: [NormalizationService],
})
export class NormalizationModule {}
