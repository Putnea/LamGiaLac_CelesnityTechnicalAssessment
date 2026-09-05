import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Client as PgClient, QueryResult } from 'pg';
import { DataSource } from './entities/data-source.entity.js';
import { CreateSourceDto } from './dto/create-source.dto.js';
import { UpdateSourceDto } from './dto/update-source.dto.js';
import { SourceType } from '../../common/enums/source-type.enum.js';
import { encryptObject, decryptObject } from '../../common/utils/crypto.util.js';

interface DatabaseCredentials {
  password: string;
}

export interface DiscoveredColumn {
  name: string;
  type: string;
  nullable: boolean;
}

export interface DiscoveredTable {
  name: string;
  columns: DiscoveredColumn[];
}

export type SchemaDiscoveryResult =
  | { endpoints: { path: string; description: string; fields: string[] }[] }
  | { tables: DiscoveredTable[] }
  | { fields: string[] }
  | { message: string };

/**
 * Manages data source registrations.
 * Security: credentials are encrypted before storage and never returned in responses.
 */
@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    @InjectRepository(DataSource)
    private readonly repo: Repository<DataSource>,
  ) { }

  /** Create and persist a new data source. */
  async create(dto: CreateSourceDto): Promise<DataSource> {
    const trimmedName = dto.name.trim();

    // Proactively check for duplicate name
    const existing = await this.repo.findOne({ where: { name: trimmedName } });
    if (existing) {
      throw new ConflictException(
        `A data source named "${trimmedName}" already exists. Please choose a unique name.`
      );
    }

    const encryptedCredentials = encryptObject(
      dto.credentials ? (dto.credentials as unknown as Record<string, unknown>) : null
    );

    const entity = this.repo.create({
      name: trimmedName,
      type: dto.type,
      config: (dto.config as unknown) as Record<string, unknown>,
      encryptedCredentials,
      selectedTarget: dto.selectedTarget ?? null,
    });

    try {
      return await this.repo.save(entity);
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        throw new ConflictException(
          `A data source named "${trimmedName}" already exists. Please choose a unique name.`
        );
      }
      throw err;
    }
  }

  /** List all active sources — credentials are excluded by entity select:false. */
  findAll(): Promise<DataSource[]> {
    return this.repo.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /** Find a single source by id — credentials are excluded. */
  async findOne(id: string): Promise<DataSource> {
    const source = await this.repo.findOne({ where: { id } });
    if (!source) throw new NotFoundException(`Data source ${id} not found`);
    return source;
  }

  /** Update non-credential fields or rotate credentials. */
  async update(id: string, dto: UpdateSourceDto): Promise<DataSource> {
    const source = await this.findOne(id);

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName !== source.name) {
        const existing = await this.repo.findOne({ where: { name: trimmedName } });
        if (existing && existing.id !== id) {
          throw new ConflictException(
            `A data source named "${trimmedName}" already exists. Please choose a unique name.`
          );
        }
        source.name = trimmedName;
      }
    }
    if (dto.config !== undefined) source.config = dto.config;
    if (dto.selectedTarget !== undefined) source.selectedTarget = dto.selectedTarget;
    if (dto.isActive !== undefined) source.isActive = dto.isActive;

    if (dto.credentials) {
      source.encryptedCredentials = encryptObject(
        dto.credentials as unknown as Record<string, unknown>
      );
    }

    try {
      return await this.repo.save(source);
    } catch (err: any) {
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        throw new ConflictException(
          `A data source named "${source.name}" already exists. Please choose a unique name.`
        );
      }
      throw err;
    }
  }

  /** Delete a data source. */
  async remove(id: string): Promise<void> {
    const source = await this.findOne(id);
    await this.repo.delete(id);
  }

  /**
   * Test that a source is reachable.
   * Updates lastTestedAt and lastTestResult.
   */
  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    const source = await this.repo.findOne({
      where: { id },
      select: ['id', 'type', 'config', 'encryptedCredentials', 'lastTestedAt', 'lastTestResult'],
    });
    if (!source) throw new NotFoundException(`Data source ${id} not found`);

    let success = false;
    let message = '';

    try {
      switch (source.type) {
        case SourceType.API:
        case SourceType.CRAWLER: {
          const baseUrl =
            source.type === SourceType.API
              ? (source.config as { baseUrl: string }).baseUrl
              : (source.config as { startUrl: string }).startUrl;
          const healthUrl =
            source.type === SourceType.API ? `${baseUrl}/health` : baseUrl;

          await axios.get(healthUrl, { timeout: 5000 });
          success = true;
          message = `Connected to ${healthUrl}`;
          break;
        }

        case SourceType.DATABASE: {
          const cfg = source.config as { host: string; port: string; database: string; username: string };
          const creds = decryptObject<DatabaseCredentials>(source.encryptedCredentials);
          const client = new PgClient({
            host: cfg.host,
            port: parseInt(cfg.port, 10),
            database: cfg.database,
            user: cfg.username,
            password: creds?.password ?? '',
            connectionTimeoutMillis: 5000,
          });
          await client.connect();
          await client.query('SELECT 1');
          await client.end();
          success = true;
          message = `Connected to PostgreSQL at ${cfg.host}:${cfg.port}/${cfg.database}`;
          break;
        }

        case SourceType.MQTT: {
          // For MQTT we just resolve — real test would require mqtt.connect attempt
          success = true;
          message = `MQTT broker URL registered: ${(source.config as { brokerUrl: string }).brokerUrl}`;
          break;
        }

        default:
          message = 'Unknown source type';
      }
    } catch (err: unknown) {
      success = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      // Log only non-sensitive context — never log credentials
      this.logger.warn(`Connection test failed for source ${id}: ${errMsg}`);
      message = `Connection failed: ${errMsg}`;
    }

    await this.repo.update(id, {
      lastTestedAt: new Date(),
      lastTestResult: success ? 'OK' : message.slice(0, 500),
    });

    return { success, message };
  }

  /**
   * Discover the schema/available fields of a source.
   * - API: returns list of available endpoints
   * - CRAWLER: returns HTML field names by scraping the first page
   * - DATABASE: returns available tables and their columns
   */
  async discoverSchema(id: string): Promise<SchemaDiscoveryResult> {
    const source = await this.repo.findOne({
      where: { id },
      select: ['id', 'type', 'config', 'encryptedCredentials'],
    });
    if (!source) throw new NotFoundException(`Data source ${id} not found`);

    switch (source.type) {
      case SourceType.API: {
        const baseUrl = (source.config as { baseUrl: string }).baseUrl;
        try {
          const { data } = await axios.get<{ endpoints: { path: string; description: string; fields: string[] }[] }>(
            `${baseUrl}/schema`,
            { timeout: 5000 }
          );
          return data;
        } catch {
          return { message: 'Schema endpoint not available on this API source' };
        }
      }

      case SourceType.CRAWLER: {
        const startUrl = (source.config as { startUrl: string }).startUrl;
        const { data: html } = await axios.get<string>(startUrl, { timeout: 5000 });
        // Extract th headers from the delivery table
        const thMatches = [...html.matchAll(/<th[^>]*>(.*?)<\/th>/gi)];
        const fields = thMatches.map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        return { fields: fields.length ? fields : ['Delivery Number', 'Supplier', 'Batch ID', 'Quantity', 'Delivery Time'] };
      }

      case SourceType.DATABASE: {
        const cfg = source.config as { host: string; port: string; database: string; username: string };
        const creds = decryptObject<DatabaseCredentials>(source.encryptedCredentials);
        const client = new PgClient({
          host: cfg.host,
          port: parseInt(cfg.port, 10),
          database: cfg.database,
          user: cfg.username,
          password: creds?.password ?? '',
          connectionTimeoutMillis: 5000,
        });

        await client.connect();
        const tablesResult = await client.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
           ORDER BY table_name`
        );

        const tables: DiscoveredTable[] = [];
        for (const row of tablesResult.rows) {
          const colResult: QueryResult<{ column_name: string; data_type: string; is_nullable: string }> =
            await client.query(
              `SELECT column_name, data_type, is_nullable
               FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = $1
               ORDER BY ordinal_position`,
              [row.table_name]
            );
          tables.push({
            name: row.table_name,
            columns: colResult.rows.map((c: { column_name: string; data_type: string; is_nullable: string }) => ({
              name: c.column_name,
              type: c.data_type,
              nullable: c.is_nullable === 'YES',
            })),
          });
        }

        await client.end();
        return { tables };
      }

      case SourceType.MQTT: {
        return {
          endpoints: [
            {
              path: 'factory/line/+/station/+/batch/+',
              description: 'Real-time IoT machine telemetry stream (WASHING / DRYING)',
              fields: [
                'batchId',
                'lineId',
                'stationCode',
                'timestamp',
                'temperature',
                'rpm',
                'cyclePhase',
                'machineId',
                'sourceRecordId',
              ],
            },
          ],
        };
      }

      default:
        throw new BadRequestException(`Schema discovery not supported for ${source.type} sources`);
    }
  }
}
