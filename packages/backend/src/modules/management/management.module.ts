import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManagementEvent } from './entities/management-event.entity.js';
import { ManagementService } from './management.service.js';
import { ManagementController } from './management.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ManagementEvent])],
  providers: [ManagementService],
  controllers: [ManagementController],
  exports: [ManagementService],
})
export class ManagementModule {}
