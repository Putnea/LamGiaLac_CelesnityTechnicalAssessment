import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SourcesService } from './sources.service.js';
import type { SchemaDiscoveryResult } from './sources.service.js';
import { CreateSourceDto } from './dto/create-source.dto.js';
import { UpdateSourceDto } from './dto/update-source.dto.js';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post()
  create(@Body() dto: CreateSourceDto) {
    return this.sourcesService.create(dto);
  }

  @Get()
  findAll() {
    return this.sourcesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sourcesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    return this.sourcesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.sourcesService.remove(id);
  }

  /** Test connectivity — safe: never returns credentials */
  @Post(':id/test')
  testConnection(@Param('id') id: string) {
    return this.sourcesService.testConnection(id);
  }

  /** Discover schema/fields for a source */
  @Get(':id/schema')
  discoverSchema(@Param('id') id: string): Promise<SchemaDiscoveryResult> {
    return this.sourcesService.discoverSchema(id);
  }
}
