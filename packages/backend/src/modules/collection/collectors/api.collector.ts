import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface RawApiRecord {
  sourceRecordId: string;
  endpoint: string;
  payload: Record<string, unknown>;
}

interface PaginatedResponse {
  data: Record<string, unknown>[];
  nextCursor: string | null;
  total?: number;
}

/**
 * Collects records from the fixture REST API source.
 *
 * Features:
 *   - Cursor-based pagination (follows nextCursor until null)
 *   - Configurable request timeout (default 10 s)
 *   - Retry with exponential backoff on transient failures (5xx, network errors)
 *     — up to MAX_RETRIES attempts
 */
@Injectable()
export class ApiCollector {
  private readonly logger = new Logger(ApiCollector.name);
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000;
  private readonly PAGE_LIMIT = 50;

  /**
   * Collect all records from all available endpoints of an API source.
   * Returns raw records with the endpoint path as context.
   *
   * @param baseUrl  Base URL of the fixture API (e.g. http://fixture-api:3001)
   * @param target   Specific endpoint path to collect (e.g. '/receiving')
   * @param timeoutMs Request timeout in milliseconds
   */
  async collect(
    baseUrl: string,
    target: string,
    timeoutMs = 10_000,
  ): Promise<{ records: RawApiRecord[]; errors: { message: string; context?: string }[] }> {
    const client = this.buildClient(baseUrl, timeoutMs);
    const records: RawApiRecord[] = [];
    const errors: { message: string; context?: string }[] = [];
    let cursor: string | undefined = undefined;
    let page = 0;

    this.logger.log(`[ApiCollector] Starting collection from ${baseUrl}${target}`);

    while (true) {
      page++;
      const params: Record<string, string | number> = { limit: this.PAGE_LIMIT };
      if (cursor) params.cursor = cursor;

      let response: PaginatedResponse;
      try {
        response = await this.fetchWithRetry<PaginatedResponse>(client, target, params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[ApiCollector] Failed on page ${page}: ${msg}`);
        errors.push({ message: `Page ${page} fetch failed: ${msg}`, context: `cursor=${cursor}` });
        break;
      }

      if (!response.data || !Array.isArray(response.data)) {
        errors.push({ message: `Unexpected response shape on page ${page}`, context: target });
        break;
      }

      for (const item of response.data) {
        const sourceRecordId = (item.sourceRecordId as string) || (item.id as string);
        if (!sourceRecordId) {
          errors.push({ message: 'Record missing sourceRecordId/id, skipping', context: `page=${page}` });
          continue;
        }
        records.push({ sourceRecordId: String(sourceRecordId), endpoint: target, payload: item });
      }

      this.logger.log(
        `[ApiCollector] Page ${page}: fetched ${response.data.length} records. ` +
        `nextCursor=${response.nextCursor ?? 'null'}`
      );

      if (!response.nextCursor) break;
      cursor = response.nextCursor;
    }

    this.logger.log(`[ApiCollector] Done. Total records: ${records.length}, errors: ${errors.length}`);
    return { records, errors };
  }

  private buildClient(baseUrl: string, timeoutMs: number): AxiosInstance {
    return axios.create({ baseURL: baseUrl, timeout: timeoutMs });
  }

  private async fetchWithRetry<T>(
    client: AxiosInstance,
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const { data } = await client.get<T>(path, { params });
        return data;
      } catch (err: unknown) {
        lastErr = err;
        const isTransient = this.isTransientError(err);
        this.logger.warn(
          `[ApiCollector] Attempt ${attempt}/${this.MAX_RETRIES} failed for ${path}: ` +
          `${err instanceof Error ? err.message : String(err)}. Transient=${isTransient}`
        );
        if (!isTransient || attempt === this.MAX_RETRIES) break;
        await this.delay(this.BASE_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }
    throw lastErr;
  }

  private isTransientError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const axiosErr = err as { response?: { status: number }; code?: string };
    if (!axiosErr.response) return true; // network error
    const status = axiosErr.response.status;
    return status >= 500 || status === 429;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
