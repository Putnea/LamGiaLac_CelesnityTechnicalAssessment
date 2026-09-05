import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ManagementService } from './management.service.js';
import { CreateManagementEventDto } from './dto/create-management-event.dto.js';

@Controller('management')
export class ManagementController {
  constructor(private readonly managementService: ManagementService) {}

  /** Append a management event (BLOCK, RESUME, ACKNOWLEDGE, NOTE) */
  @Post('events')
  create(@Body() dto: CreateManagementEventDto) {
    return this.managementService.create(dto);
  }

  /** Get all management events for a batch (audit trail) */
  @Get('batches/:batchId/events')
  getForBatch(@Param('batchId') batchId: string) {
    return this.managementService.findForBatch(batchId);
  }
}
