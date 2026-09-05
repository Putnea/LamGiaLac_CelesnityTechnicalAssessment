import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SourceType } from '../../../common/enums/source-type.enum.js';

export class ApiSourceConfig {
  @IsString() @IsNotEmpty()
  baseUrl: string;
}

export class CrawlerSourceConfig {
  @IsString() @IsNotEmpty()
  startUrl: string;
}

export class DatabaseSourceConfig {
  @IsString() @IsNotEmpty()
  host: string;

  @IsString() @IsNotEmpty()
  port: string;

  @IsString() @IsNotEmpty()
  database: string;

  @IsString() @IsNotEmpty()
  username: string;
}

export class MqttSourceConfig {
  @IsString() @IsNotEmpty()
  brokerUrl: string;

  @IsString() @IsNotEmpty()
  topicPattern: string;
}

/**
 * Credentials are accepted at registration time, encrypted, and stored.
 * The raw values must never be logged or returned.
 */
export class SourceCredentials {
  /** For DATABASE sources */
  @IsOptional()
  @IsString()
  password?: string;

  /** For API sources using token auth */
  @IsOptional()
  @IsString()
  token?: string;
}

export class CreateSourceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(SourceType)
  type: SourceType;

  @IsObject()
  config: ApiSourceConfig | CrawlerSourceConfig | DatabaseSourceConfig | MqttSourceConfig;

  @IsOptional()
  @ValidateNested()
  @Type(() => SourceCredentials)
  credentials?: SourceCredentials;

  @IsOptional()
  @IsString()
  selectedTarget?: string;
}
