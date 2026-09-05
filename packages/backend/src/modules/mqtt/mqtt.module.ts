import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanonicalEvent } from '../normalization/entities/canonical-event.entity.js';
import { NormalizationModule } from '../normalization/normalization.module.js';
import { MqttCollector } from './mqtt.collector.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CanonicalEvent]),
    NormalizationModule,
  ],
  providers: [MqttCollector],
  exports: [MqttCollector],
})
export class MqttModule {}
