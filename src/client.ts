/**
 * KLOAKD TypeScript SDK — Main client class.
 *
 * @example
 * ```typescript
 * import { Kloakd } from 'kloakd-sdk';
 *
 * const client = new Kloakd({
 *   apiKey: 'sk-live-abc123',
 *   organizationId: 'your-org-id',
 * });
 *
 * const result = await client.crawl('https://example.com', {
 *   maxPages: 50,
 *   extractSchema: { title: 'css:h1' },
 * });
 * for (const page of result.pages) {
 *   if (page.ok) console.log(page.url, page.structuredData);
 * }
 * ```
 */

import { HttpTransport } from './_http.js';
import { getHandoff, postFollowingHandoff, waitForHandoff } from './_handoff.js';
import { query, seg } from './_params.js';
import { checkExportFormat, openExport, saveExport } from './_download.js';
import type { HandoffOptions } from './_handoff.js';
import {
  AuthenticationError,
  BillingUnavailableError,
  NotEntitledError,
  PaymentRequiredError,
  QuotaExceededError,
  RateLimitError,
} from './errors.js';
import { EvadrNamespace } from './modules/evadr.js';
import type { FetchOptions } from './modules/evadr.js';
import { FetchyrNamespace } from './modules/fetchyr.js';
import { KolektrNamespace, toSchemaSpec } from './modules/kolektr.js';
import type { ExtractSchema } from './modules/kolektr.js';
import { NexusNamespace } from './modules/nexus.js';
import { ParlyrNamespace } from './modules/parlyr.js';
import { SkanyrNamespace } from './modules/skanyr.js';
import { WebgrphNamespace } from './modules/webgrph.js';
import type { CrawlOptions } from './modules/webgrph.js';
import type {
  BatchJob,
  BatchJobItem,
  BatchJobResults,
  BatchJobsPage,
  CrawlPage,
  CrawlProgressEvent,
  CrawlResult,
  ExportDownload,
  ExportFormat,
  FetchResult,
  SavedExport,
  SiteCrawlResult,
  UnifiedEscalation,
  UnifiedScrapeProgress,
  UnifiedScrapeResult,
  UnifiedScrapeStatus,
} from './models.js';

const DEFAULT_BASE_URL = 'https://api.kloakd.dev';
/**
 * Seconds. Above the API's 85 s synchronous wait, so a long request
 * receives the API's 202 hand-off (which the SDK follows) instead of timing out.
 */
const DEFAULT_TIMEOUT = 100;
const DEFAULT_MAX_RETRIES = 3;

export interface KloakdOptions {
  apiKey: string;
  organizationId: string;
  baseUrl?: string;
  /** Per-request timeout in seconds (default 100). Event streams have none. */
  timeout?: number;
  /** Retries of a failed request (default 3); see the retry policy in the README. */
  maxRetries?: number;
  /** Injected fetch — for testing only. */
  fetchImpl?: typeof fetch;
}

export interface CrawlOrchestratorOptions {
  /** Unset: the API's default for the organisation's tier. */
  maxDepth?: number;
  /** Unset: the API's default for the organisation's tier. */
  maxPages?: number;
  /** Extract each fetched page with this schema (see `kolektr.page`). */
  extractSchema?: ExtractSchema;
  /**
   * With `extractSchema`: one record per element this CSS selector matches on
   * each page (see `kolektr.page`). Every record is in the page's `records`;
   * `structuredData` is the first.
   */
  extractItemSelector?: string;
  includeExternalLinks?: boolean;
  sessionArtifactId?: string;
}

/** Options for `createBatchJob` (the body of `POST batch-jobs`). */
export interface BatchJobOptions {
  /** How each URL is extracted, for example `{ selectors: { title: 'h1' } }`. */
  extractionConfig?: Record<string, unknown>;
  /** The crawl the URLs came from: its detected-API records are added to the results. */
  crawlId?: string;
  /** What each page holds, for example `products`. */
  entityType?: string;
  /** The names of the fields to extract. */
  fields?: string[];
}

/** Options for `unifiedScrape` (unified_scraping.py UnifiedScrapeRequest) and how a 202 is followed. */
export interface UnifiedScrapeOptions extends HandoffOptions {
  /** What to extract, in plain words. */
  prompt?: string;
  /** auto (the API's default), level1 or level2. */
  mode?: 'auto' | 'level1' | 'level2';
  /** Field name to description; made from `prompt` when omitted. */
  schema?: Record<string, string>;
  /** Scraping options (timeout, proxy and so on). */
  options?: Record<string, unknown>;
  /** Context for the Strategy Engine. */
  context?: Record<string, unknown>;
  /** Constraints for the Strategy Engine. */
  constraints?: Record<string, unknown>;
  /** A login session's id, to scrape behind a login. */
  sessionArtifactId?: string;
}

type Raw = Record<string, unknown>;
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const objOrNull = (v: unknown): Raw | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : null;

function parseBatchJob(raw: Raw): BatchJob {
  return {
    id: String(raw['id'] ?? ''),
    name: String(raw['name'] ?? ''),
    status: String(raw['status'] ?? ''),
    totalItems: Number(raw['total_items'] ?? 0),
    completedItems: Number(raw['completed_items'] ?? 0),
    createdAt: String(raw['created_at'] ?? ''),
    message: strOrNull(raw['message']),
  };
}

function parseBatchJobItem(raw: Raw): BatchJobItem {
  return {
    jobId: String(raw['job_id'] ?? ''),
    url: strOrNull(raw['url']),
    status: String(raw['status'] ?? ''),
    extractedData: raw['extracted_data'] ?? null,
    apiData: objOrNull(raw['api_data']),
  };
}

function parseEscalations(raw: unknown): UnifiedEscalation[] {
  return (Array.isArray(raw) ? (raw as Raw[]) : []).map((e) => ({
    from: String(e['from'] ?? ''),
    to: String(e['to'] ?? ''),
    reason: String(e['reason'] ?? ''),
    timestamp: String(e['timestamp'] ?? ''),
  }));
}

function parseUnifiedProgress(raw: Raw | null): UnifiedScrapeProgress | null {
  if (raw === null) return null;
  return {
    percentage: Number(raw['percentage'] ?? 0),
    currentStep: String(raw['current_step'] ?? ''),
    itemsFound: numOrNull(raw['items_found']),
    itemsTarget: numOrNull(raw['items_target']),
    partialResults: Array.isArray(raw['partial_results']) ? (raw['partial_results'] as Raw[]) : null,
  };
}

/**
 * Errors that stop a crawl's page loop instead of being recorded on a page:
 * every later page would fail the same way.
 */
function isFatal(err: unknown): boolean {
  return (
    err instanceof PaymentRequiredError ||
    err instanceof QuotaExceededError ||
    err instanceof BillingUnavailableError ||
    err instanceof NotEntitledError ||
    err instanceof AuthenticationError ||
    err instanceof RateLimitError
  );
}

function failedPage(url: string, error: string): CrawlPage {
  return {
    success: false,
    url,
    statusCode: 0,
    tierUsed: 0,
    html: null,
    structuredData: null,
    records: [],
    artifactId: null,
    error,
    get ok() { return false; },
  };
}

function fetchedPage(
  fetchResult: FetchResult,
  structuredData: Record<string, unknown> | null,
  records: Record<string, unknown>[] = [],
): CrawlPage {
  return {
    success: fetchResult.success,
    url: fetchResult.url,
    statusCode: fetchResult.statusCode,
    tierUsed: fetchResult.tierUsed,
    html: fetchResult.html,
    structuredData,
    records,
    artifactId: fetchResult.artifactId,
    error: fetchResult.error,
    get ok() { return fetchResult.success && fetchResult.error === null; },
  };
}

export class Kloakd {
  readonly evadr: EvadrNamespace;
  readonly webgrph: WebgrphNamespace;
  readonly skanyr: SkanyrNamespace;
  readonly nexus: NexusNamespace;
  readonly parlyr: ParlyrNamespace;
  readonly fetchyr: FetchyrNamespace;
  readonly kolektr: KolektrNamespace;

  private readonly _transport: HttpTransport;

  constructor(opts: KloakdOptions) {
    if (!opts.apiKey?.trim()) throw new Error('Kloakd: apiKey is required');
    if (!opts.organizationId?.trim()) throw new Error('Kloakd: organizationId is required');

    this._transport = new HttpTransport({
      apiKey: opts.apiKey,
      organizationId: opts.organizationId,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      ...(opts.fetchImpl !== undefined && { fetchImpl: opts.fetchImpl }),
    });

    this.evadr = new EvadrNamespace(this._transport);
    this.webgrph = new WebgrphNamespace(this._transport);
    this.skanyr = new SkanyrNamespace(this._transport);
    this.nexus = new NexusNamespace(this._transport);
    this.parlyr = new ParlyrNamespace(this._transport);
    this.fetchyr = new FetchyrNamespace(this._transport);
    this.kolektr = new KolektrNamespace(this._transport);
  }

  /**
   * The state of a request the API handed off as a job (HTTP 202):
   * `{status: running|completed|failed, result?, error?}`
   * (`GET handoff/{job_id}`). A 404 means unknown or expired (after an hour).
   */
  async getHandoff(jobId: string): Promise<Record<string, unknown>> {
    return getHandoff(this._transport, jobId);
  }

  /**
   * Wait for a handed-off job and return the route's own result; use it to
   * resume after a JobTimeoutError (its `jobId`). Throws JobFailedError if
   * the job failed or is gone, JobTimeoutError if still running at `pollTimeoutMs`.
   */
  async waitForHandoff(jobId: string, opts: HandoffOptions = {}): Promise<Record<string, unknown>> {
    return waitForHandoff(this._transport, jobId, opts);
  }

  /**
   * Download a batch job's results as a stream
   * (`GET batch-jobs/{batch_job_id}/export`; `format`: json, ndjson or csv,
   * default json). One row per extracted item; a batch still running
   * exports the results it has. 404 for a batch that is not yours.
   */
  async exportBatchJob(batchJobId: string, opts: { format?: ExportFormat } = {}): Promise<ExportDownload> {
    const format = checkExportFormat(opts.format);
    return openExport(this._transport, `batch-jobs/${seg(batchJobId)}/export`, { format });
  }

  /** Download a batch job's results to a file, written as it arrives (Node.js only). */
  async downloadBatchJob(batchJobId: string, filePath: string, opts: { format?: ExportFormat } = {}): Promise<SavedExport> {
    const format = checkExportFormat(opts.format);
    return saveExport(this._transport, `batch-jobs/${seg(batchJobId)}/export`, { format }, filePath);
  }

  /**
   * Create a batch job: one extraction per URL (`POST batch-jobs`, 201).
   * The batch holds one work slot until it ends. Refused with 403
   * `test_key_not_allowed` for a test key, 413 `batch_too_large` over the
   * tier's URL limit, 422 for an empty list, ConcurrencyLimitError (409)
   * at the tier's running batches, and 503 `dispatch_failed` when it could
   * not be queued (nothing was started). Never retried.
   */
  async createBatchJob(urls: string[], opts: BatchJobOptions = {}): Promise<BatchJob> {
    const body: Raw = { urls };
    if (opts.extractionConfig !== undefined) body['extraction_config'] = opts.extractionConfig;
    if (opts.crawlId !== undefined) body['crawl_id'] = opts.crawlId;
    if (opts.entityType !== undefined) body['entity_type'] = opts.entityType;
    if (opts.fields !== undefined) body['fields'] = opts.fields;
    return parseBatchJob(await this._transport.post('batch-jobs', body));
  }

  /** A batch job's state (`GET batch-jobs/{batch_job_id}`). 404 for a batch that is not yours. */
  async getBatchJob(batchJobId: string): Promise<BatchJob> {
    return parseBatchJob(await this._transport.get(`batch-jobs/${seg(batchJobId)}`));
  }

  /** The organisation's batch jobs, newest first (`GET batch-jobs`; `pageSize` 1 to 100, default 20). */
  async listBatchJobs(opts: { page?: number; pageSize?: number } = {}): Promise<BatchJobsPage> {
    const raw = await this._transport.get('batch-jobs', query({ page: opts.page, page_size: opts.pageSize }));
    return {
      total: Number(raw['total'] ?? 0),
      batchJobs: ((raw['batch_jobs'] as Raw[] | undefined) ?? []).map(parseBatchJob),
    };
  }

  /**
   * A batch's items with what each extracted
   * (`GET batch-jobs/{batch_job_id}/results`). Every item without `limit`;
   * with `limit` (1 to 1000) that many from `offset`, and the counts are
   * then of the whole batch. To download the rows use `exportBatchJob`.
   */
  async getBatchJobResults(batchJobId: string, opts: { limit?: number; offset?: number } = {}): Promise<BatchJobResults> {
    const raw = await this._transport.get(
      `batch-jobs/${seg(batchJobId)}/results`,
      query({ limit: opts.limit, offset: opts.offset }),
    );
    return {
      batchJobId: String(raw['batch_job_id'] ?? batchJobId),
      results: ((raw['results'] as Raw[] | undefined) ?? []).map(parseBatchJobItem),
      totalJobs: Number(raw['total_jobs'] ?? 0),
      completedJobs: Number(raw['completed_jobs'] ?? 0),
      failedJobs: Number(raw['failed_jobs'] ?? 0),
    };
  }

  /**
   * Pause a running batch (`POST batch-jobs/{batch_job_id}/pause`). Items
   * already running finish; no other item starts until `resumeBatchJob`.
   * Pausing a paused batch changes nothing. A batch in any other state is
   * a 409 `ApiError` with `code` `invalid_batch_transition`.
   */
  async pauseBatchJob(batchJobId: string): Promise<BatchJob> {
    return parseBatchJob(await this._transport.post(`batch-jobs/${seg(batchJobId)}/pause`, {}));
  }

  /**
   * Resume a paused batch (`POST batch-jobs/{batch_job_id}/resume`): the
   * items held while it was paused are queued again, each once. Resuming a
   * running batch changes nothing. A batch in any other state is a 409
   * `ApiError` with `code` `invalid_batch_transition`. Gated like creation
   * (quota, payment, ConcurrencyLimitError at the tier's running batches).
   * A 503 `ApiError` with `code` `dispatch_failed` means the items could
   * not be queued and the batch is paused again: call it again.
   */
  async resumeBatchJob(batchJobId: string): Promise<BatchJob> {
    return parseBatchJob(await this._transport.post(`batch-jobs/${seg(batchJobId)}/resume`, {}));
  }

  /**
   * Cancel a batch and every item of it that has not ended
   * (`POST batch-jobs/{batch_job_id}/cancel`). Completed and failed items
   * keep their results. Cancelling a cancelled batch changes nothing. A
   * batch that has completed or failed is a 409 `ApiError` with `code`
   * `invalid_batch_transition`.
   */
  async cancelBatchJob(batchJobId: string): Promise<BatchJob> {
    return parseBatchJob(await this._transport.post(`batch-jobs/${seg(batchJobId)}/cancel`, {}));
  }

  /**
   * Scrape a URL and let the API choose how (`POST scraping/unified`):
   * level 1 (direct extraction) or level 2 (the Strategy Engine), with
   * escalation when the first fails. Needs a live API key entitled to
   * Kolektr and Nexus (403 `test_key_not_allowed`, `module_not_entitled`).
   * A request the API hands off (202) is followed to its result. The
   * answer names the job; read its state and data with `getUnifiedScrape`.
   * When the URL is behind a login the answer has `authRequired` true and
   * nothing was scraped.
   *
   * Check `status`: when the scrape fails the API still answers with
   * `success` true and `status` `'failed'`, without the error text, and
   * that answer's `jobId` names no stored job, so `getUnifiedScrape` on it
   * is the API's 404.
   */
  async unifiedScrape(url: string, opts: UnifiedScrapeOptions = {}): Promise<UnifiedScrapeResult> {
    const body: Raw = { url };
    if (opts.prompt !== undefined) body['prompt'] = opts.prompt;
    if (opts.mode !== undefined) body['mode'] = opts.mode;
    if (opts.schema !== undefined) body['schema'] = opts.schema;
    if (opts.options !== undefined) body['options'] = opts.options;
    if (opts.context !== undefined) body['context'] = opts.context;
    if (opts.constraints !== undefined) body['constraints'] = opts.constraints;
    if (opts.sessionArtifactId !== undefined) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await postFollowingHandoff(this._transport, 'scraping/unified', body, opts);
    return {
      success: raw['success'] !== false,
      jobId: String(raw['job_id'] ?? ''),
      level: String(raw['level'] ?? ''),
      status: String(raw['status'] ?? ''),
      escalationPath: parseEscalations(raw['escalation_path']),
      message: String(raw['message'] ?? ''),
      metadata: objOrNull(raw['metadata']),
      authRequired: raw['auth_required'] === true,
      discoveryId: strOrNull(raw['discovery_id']),
    };
  }

  /**
   * The state of a unified scrape job and, once it has one, its result
   * (`GET scraping/unified/{job_id}`). 404 for a job that is not yours.
   */
  async getUnifiedScrape(jobId: string): Promise<UnifiedScrapeStatus> {
    const raw = await this._transport.get(`scraping/unified/${seg(jobId)}`);
    return {
      id: String(raw['id'] ?? jobId),
      status: String(raw['status'] ?? ''),
      level: String(raw['level'] ?? ''),
      progress: numOrNull(raw['progress']),
      progressDetail: parseUnifiedProgress(objOrNull(raw['progress_detail'])),
      createdAt: String(raw['created_at'] ?? ''),
      updatedAt: strOrNull(raw['updated_at']),
      completedAt: strOrNull(raw['completed_at']),
      error: strOrNull(raw['error']),
      result: objOrNull(raw['result']),
      escalationPath: parseEscalations(raw['escalation_path']),
    };
  }

  /**
   * Crawl a site, fetch every page found and (with `extractSchema`) extract
   * each. A page that fails is recorded on its page; billing, auth and
   * rate-limit errors stop the crawl and are thrown. When the discovery
   * crawl is held for quota the result has `held` true and no pages (see
   * `webgrph.waitForCrawl`).
   */
  async crawl(url: string, opts: CrawlOrchestratorOptions = {}): Promise<SiteCrawlResult> {
    let result: SiteCrawlResult | undefined;
    for await (const event of this.crawlStream(url, opts)) {
      if (event.type === 'crawl_complete') result = event.metadata['result'] as SiteCrawlResult;
    }
    return result!;
  }

  /** As crawl(), yielding progress events; the last (`crawl_complete`) carries the result in `metadata.result`. */
  async *crawlStream(url: string, opts: CrawlOrchestratorOptions = {}): AsyncIterable<CrawlProgressEvent> {
    // A schema the API would refuse fails here, not silently on every page.
    if (opts.extractItemSelector !== undefined) {
      if (!opts.extractSchema) throw new Error('Kloakd: extractItemSelector needs extractSchema');
      toSchemaSpec(opts.extractSchema, opts.extractItemSelector);
    }
    yield { type: 'discovery_started', url, page: null, total: null, success: null, error: null, metadata: {} };

    const crawlOpts: CrawlOptions = { includeExternalLinks: opts.includeExternalLinks ?? false };
    if (opts.maxDepth !== undefined) crawlOpts.maxDepth = opts.maxDepth;
    if (opts.maxPages !== undefined) crawlOpts.maxPages = opts.maxPages;
    if (opts.sessionArtifactId) crawlOpts.sessionArtifactId = opts.sessionArtifactId;
    const crawlResult: CrawlResult = await this.webgrph.crawl(url, crawlOpts);

    const total = crawlResult.totalPages;
    yield {
      type: 'discovery_complete', url, page: null, total, success: crawlResult.success, error: crawlResult.error,
      metadata: { pagesFound: total, crawlId: crawlResult.crawlId, status: crawlResult.status, held: crawlResult.held, message: crawlResult.message },
    };

    const fetchOpts: FetchOptions = opts.sessionArtifactId ? { sessionArtifactId: opts.sessionArtifactId } : {};
    const pages: CrawlPage[] = [];
    let fetched = 0;
    let failed = 0;

    for (let i = 0; i < crawlResult.pages.length; i++) {
      const node = crawlResult.pages[i]!;
      const pageNum = i + 1;

      yield { type: 'page_fetching', url: node.url, page: pageNum, total, success: null, error: null, metadata: {} };

      let page: CrawlPage;
      try {
        const fetchResult = await this.evadr.fetch(node.url, fetchOpts);
        let structuredData: Record<string, unknown> | null = null;
        let records: Record<string, unknown>[] = [];
        if (opts.extractSchema && fetchResult.ok) {
          try {
            const extraction = await this.kolektr.page(node.url, {
              schema: opts.extractSchema,
              ...(opts.extractItemSelector !== undefined && { itemSelector: opts.extractItemSelector }),
              ...(fetchResult.artifactId && { fetchArtifactId: fetchResult.artifactId }),
            });
            records = extraction.records;
            structuredData = records[0] ?? null;
          } catch (err) {
            if (isFatal(err)) throw err;
            // Any other extraction failure is recorded as no data; the page still has its HTML.
          }
        }
        page = fetchedPage(fetchResult, structuredData, records);
      } catch (err) {
        if (isFatal(err)) throw err;
        page = failedPage(node.url, err instanceof Error ? err.message : String(err));
      }

      pages.push(page);
      if (page.ok) {
        fetched++;
        yield { type: 'page_fetched', url: node.url, page: pageNum, total, success: true, error: null, metadata: { tierUsed: page.tierUsed } };
      } else {
        failed++;
        yield { type: 'page_failed', url: node.url, page: pageNum, total, success: false, error: page.error, metadata: {} };
      }
    }

    const result: SiteCrawlResult = {
      success: crawlResult.success,
      url,
      totalPagesDiscovered: total,
      pagesFetched: fetched,
      pagesFailed: failed,
      pages,
      crawlArtifactId: crawlResult.artifactId,
      error: crawlResult.error,
      crawlId: crawlResult.crawlId,
      status: crawlResult.status,
      message: crawlResult.message,
      held: crawlResult.held,
    };

    yield { type: 'crawl_complete', url, page: null, total, success: result.success, error: result.error, metadata: { result } };
  }

  toString(): string {
    return `Kloakd(organizationId=${this._transport._organizationId}, baseUrl=${this._transport._baseUrl})`;
  }
}
