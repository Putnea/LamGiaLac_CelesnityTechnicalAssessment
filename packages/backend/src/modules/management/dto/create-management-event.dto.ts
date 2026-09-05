import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ManagementEventType } from '../entities/management-event.entity.js';

export class CreateManagementEventDto {
  @IsString()
  @IsNotEmpty()
  batchId: string;

  @IsEnum(ManagementEventType)
  eventType: ManagementEventType;

  @IsOptional()
  @IsString()
  actor?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
