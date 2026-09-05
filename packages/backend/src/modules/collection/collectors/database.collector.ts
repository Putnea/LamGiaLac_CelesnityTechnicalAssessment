import { Injectable, Logger } from '@nestjs/common';
import { Client as PgClient } from 'pg';
import { decryptObject } from '../../../common/utils/crypto.util.js';

export interface RawDbRecord {
  sourceRecordId: string;
  tableName: string;
  payload: Record<string, unknown>;
}

export interface DbError {
  message: string;
  context?: string;
}

interface DatabaseCredentials {
  password: string;
}

/**
 * Collects records from an external PostgreSQL production database (Source #3).
 *
 * Features:
 *   - Decrypts credentials at runtime — never logs them
 *   - Offset-based pagination via LIMIT/OFFSET
 *   - Uses `source_record_id` column as stable record identifier
 *     (falls back to the `id` column)
 *   - Connection timeout enforced
 */
@Injectable()
export class DatabaseCollector {
  private readonly logger = new Logger(DatabaseCollector.name);
  private readonly PAGE_SIZE = 200;

  async collect(
    config: { host: string; port: string; database: string; username: string },
    encryptedCredentials: string | null,
    tableName: string,
    timeoutMs = 10_000,
  ): Promise<{ records: RawDbRecord[]; errors: DbError[] }> {
    const records: RawDbRecord[] = [];
    const errors: DbError[] = [];

    const creds = decryptObject<DatabaseCredentials>(encryptedCredentials);
    const client = new PgClient({
      host: config.host,
      port: parseInt(config.port, 10),
      database: config.database,
      user: config.username,
      password: creds?.password ?? '',
      connectionTimeoutMillis: timeoutMs,
      statement_timeout: timeoutMs,
    });

    try {
      await client.connect();
      this.logger.log(
        `[DbCollector] Connected to ${config.host}:${config.port}/${config.database} ` +
        `— collecting from table: ${tableName}`
      );

      // Verify table exists before paginating
      const tableCheck = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables
           WHERE table_schema='public' AND table_name=$1
         ) AS exists`,
        [tableName]
      );
      if (!tableCheck.rows[0]?.exists) {
        throw new Error(`Table "${tableName}" does not exist in the connected database`);
      }

      // Paginate the table with LIMIT/OFFSET
      let offset = 0;
      let page = 0;
      while (true) {
        page++;
        const result = await client.query<Record<string, unknown>>(
          `SELECT * FROM "${tableName}" ORDER BY id LIMIT $1 OFFSET $2`,
          [this.PAGE_SIZE, offset]
        );

        if (result.rows.length === 0) break;

        for (const row of result.rows) {
          // Use source_record_id if present, then id, then construct one
          const srcId =
            (row['source_record_id'] as string | undefined) ||
            (row['id'] as string | number | undefined)?.toString() ||
            `${tableName}-${offset + result.rows.indexOf(row)}`;

          records.push({
            sourceRecordId: srcId,
            tableName,
            payload: row,
          });
        }

        this.logger.log(
          `[DbCollector] Page ${page}: fetched ${result.rows.length} rows from ${tableName} (offset=${offset})`
        );

        if (result.rows.length < this.PAGE_SIZE) break;
        offset += this.PAGE_SIZE;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // IMPORTANT: never log the error message if it might contain password info
      this.logger.error(`[DbCollector] Collection failed for table "${tableName}": ${msg}`);
      errors.push({ message: `Collection failed: ${msg}`, context: `table=${tableName}` });
    } finally {
      try { await client.end(); } catch { /* ignore disconnect errors */ }
    }

    this.logger.log(
      `[DbCollector] Done. Records=${records.length}, Errors=${errors.length}`
    );
    return { records, errors };
  }
}
