import { IsOptional, IsString, IsBoolean, IsObject } from 'class-validator';
import { SourceCredentials } from './create-source.dto.js';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class UpdateSourceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => SourceCredentials)
  credentials?: SourceCredentials;

  @IsOptional()
  @IsString()
  selectedTarget?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
