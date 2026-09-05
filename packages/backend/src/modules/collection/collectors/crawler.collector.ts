import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface RawCrawlerRecord {
  sourceRecordId: string;
  deliveryNumber: string;
  supplier: string;
  batchId: string;
  quantity: number;
  deliveryTime: string;
  pageUrl: string;
}

export interface CrawlerError {
  message: string;
  context?: string;
}

/**
 * Crawls a paginated supplier HTML site to extract delivery records.
 *
 * Features:
 *   - Offset-based pagination via ?page=<n>
 *   - Loop detection: tracks all visited page URLs
 *   - Malformed row handling: skips rows missing required fields, reports them
 *   - Never fails the whole run due to a single bad row
 *
 * Expected HTML structure (from fixture supplier site):
 *   <table id="delivery-table">
 *     <tbody>
 *       <tr data-id="<sourceRecordId>">
 *         <td>Delivery Number</td>
 *         <td>Supplier</td>
 *         <td>Batch ID</td>
 *         <td>Quantity</td>
 *         <td>Delivery Time</td>
 *       </tr>
 *     </tbody>
 *   </table>
 *   <a href="...?page=2" id="next-page">Next →</a>
 */
@Injectable()
export class CrawlerCollector {
  private readonly logger = new Logger(CrawlerCollector.name);
  private readonly MAX_PAGES = 500; // hard cap to prevent runaway crawls

  async collect(
    startUrl: string,
    timeoutMs = 10_000,
  ): Promise<{ records: RawCrawlerRecord[]; errors: CrawlerError[] }> {
    const records: RawCrawlerRecord[] = [];
    const errors: CrawlerError[] = [];
    const visitedUrls = new Set<string>();

    let currentUrl: string | null = startUrl;
    let pageCount = 0;

    this.logger.log(`[CrawlerCollector] Starting crawl from ${startUrl}`);

    while (currentUrl) {
      // Pagination loop detection
      if (visitedUrls.has(currentUrl)) {
        this.logger.warn(`[CrawlerCollector] Loop detected — already visited ${currentUrl}. Stopping.`);
        errors.push({ message: 'Pagination loop detected', context: currentUrl });
        break;
      }

      if (pageCount >= this.MAX_PAGES) {
        this.logger.warn(`[CrawlerCollector] Reached max page cap (${this.MAX_PAGES}). Stopping.`);
        errors.push({ message: `Max page cap (${this.MAX_PAGES}) reached` });
        break;
      }

      visitedUrls.add(currentUrl);
      pageCount++;

      let html: string;
      try {
        const { data } = await axios.get<string>(currentUrl, {
          timeout: timeoutMs,
          headers: { Accept: 'text/html' },
        });
        html = data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`[CrawlerCollector] Failed to fetch ${currentUrl}: ${msg}`);
        errors.push({ message: `Fetch failed: ${msg}`, context: currentUrl });
        break;
      }

      const $ = cheerio.load(html);
      const pageRecords = this.extractRows($, currentUrl, errors);
      records.push(...pageRecords);

      this.logger.log(
        `[CrawlerCollector] Page ${pageCount} (${currentUrl}): ` +
        `${pageRecords.length} records extracted`
      );

      // Find next page link
      const nextHref = $('#next-page').attr('href');
      if (!nextHref || $('#next-page').attr('aria-disabled') === 'true') {
        this.logger.log('[CrawlerCollector] No more pages. Crawl complete.');
        break;
      }

      // Resolve relative URLs
      currentUrl = this.resolveUrl(startUrl, nextHref);
    }

    this.logger.log(
      `[CrawlerCollector] Done. Pages=${pageCount}, Records=${records.length}, Errors=${errors.length}`
    );
    return { records, errors };
  }

  private extractRows(
    $: cheerio.CheerioAPI,
    pageUrl: string,
    errors: CrawlerError[],
  ): RawCrawlerRecord[] {
    const records: RawCrawlerRecord[] = [];

    $('#delivery-table tbody tr').each((_i, el) => {
      const row = $(el);
      const sourceRecordId = row.attr('data-id');
      const cells = row.find('td');

      // Always require the data-id attribute
      if (!sourceRecordId) {
        errors.push({
          message: 'Row missing data-id attribute — skipped',
          context: pageUrl,
        });
        return;
      }

      const deliveryNumber = cells.eq(0).text().trim();
      const supplier = cells.eq(1).text().trim();
      const batchIdRaw = cells.eq(2).text().trim();
      const quantityRaw = cells.eq(3).text().trim();
      const deliveryTime = cells.eq(4).text().trim();

      // Validate required fields — malformed rows are reported but not fatal
      if (!batchIdRaw || batchIdRaw === '' || cells.eq(2).html()?.includes('MISSING')) {
        errors.push({
          message: `Malformed row: missing batchId (sourceRecordId=${sourceRecordId})`,
          context: pageUrl,
        });
        this.logger.warn(`[CrawlerCollector] Skipping malformed row: sourceRecordId=${sourceRecordId}`);
        return;
      }

      const quantity = parseInt(quantityRaw, 10);
      if (Number.isNaN(quantity)) {
        errors.push({
          message: `Malformed row: invalid quantity "${quantityRaw}" (sourceRecordId=${sourceRecordId})`,
          context: pageUrl,
        });
        return;
      }

      records.push({
        sourceRecordId,
        deliveryNumber,
        supplier,
        batchId: batchIdRaw,
        quantity,
        deliveryTime,
        pageUrl,
      });
    });

    return records;
  }

  private resolveUrl(base: string, href: string): string {
    if (href.startsWith('http')) return href;
    try {
      const baseUrl = new URL(base);
      return new URL(href, baseUrl.origin).toString();
    } catch {
      return href;
    }
  }
}
