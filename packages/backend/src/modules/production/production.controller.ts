import { Controller, Get, Param } from '@nestjs/common';
import { ProductionService } from './production.service.js';
import {
  LineSummary,
  ProductionLineView,
  BatchView,
} from './production.types.js';

@Controller('production')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  /**
   * Get summaries for all production lines (LINE-A, LINE-B, etc.)
   */
  @Get('lines')
  getLines(): Promise<LineSummary[]> {
    return this.productionService.getLineSummaries();
  }

  /**
   * Get full details for a specific production line, including stations and batch cards
   */
  @Get('lines/:lineId')
  getLineDetails(@Param('lineId') lineId: string): Promise<ProductionLineView> {
    return this.productionService.getLineView(lineId);
  }

  /**
   * Get list of all batches across all lines
   */
  @Get('batches')
  getAllBatches(): Promise<BatchView[]> {
    return this.productionService.getAllBatches();
  }

  /**
   * Get detailed view for a single batch including state, indicators, and complete station history
   */
  @Get('batches/:batchId')
  getBatchDetails(@Param('batchId') batchId: string): Promise<BatchView> {
    return this.productionService.getBatchView(batchId);
  }
}
