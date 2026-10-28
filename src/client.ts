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
import { getHandoff, waitForHandoff } from './_handoff.js';
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
import { KolektrNamespace } from './modules/kolektr.js';
import type { ExtractSchema } from './modules/kolektr.js';
import { NexusNamespace } from './modules/nexus.js';
import { ParlyrNamespace } from './modules/parlyr.js';
import { SkanyrNamespace } from './modules/skanyr.js';
import { WebgrphNamespace } from './modules/webgrph.js';
import type { CrawlOptions } from './modules/webgrph.js';
import type { CrawlPage, CrawlProgressEvent, CrawlResult, FetchResult, SiteCrawlResult } from './models.js';

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
  includeExternalLinks?: boolean;
  sessionArtifactId?: string;
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
    artifactId: null,
    error,
    get ok() { return false; },
  };
}

function fetchedPage(fetchResult: FetchResult, structuredData: Record<string, unknown> | null): CrawlPage {
  return {
    success: fetchResult.success,
    url: fetchResult.url,
    statusCode: fetchResult.statusCode,
    tierUsed: fetchResult.tierUsed,
    html: fetchResult.html,
    structuredData,
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
   * Crawl a site, fetch every page found and (with `extractSchema`) extract
   * each. A page that fails is recorded on its page; billing, auth and
   * rate-limit errors stop the crawl and are thrown.
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
    yield { type: 'discovery_started', url, page: null, total: null, success: null, error: null, metadata: {} };

    const crawlOpts: CrawlOptions = { includeExternalLinks: opts.includeExternalLinks ?? false };
    if (opts.maxDepth !== undefined) crawlOpts.maxDepth = opts.maxDepth;
    if (opts.maxPages !== undefined) crawlOpts.maxPages = opts.maxPages;
    if (opts.sessionArtifactId) crawlOpts.sessionArtifactId = opts.sessionArtifactId;
    const crawlResult: CrawlResult = await this.webgrph.crawl(url, crawlOpts);

    const total = crawlResult.totalPages;
    yield { type: 'discovery_complete', url, page: null, total, success: crawlResult.success, error: crawlResult.error, metadata: { pagesFound: total } };

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
        if (opts.extractSchema && fetchResult.ok) {
          try {
            const extraction = await this.kolektr.page(node.url, {
              schema: opts.extractSchema,
              ...(fetchResult.artifactId && { fetchArtifactId: fetchResult.artifactId }),
            });
            structuredData = extraction.records[0] ?? null;
          } catch (err) {
            if (isFatal(err)) throw err;
            // Any other extraction failure is recorded as no data; the page still has its HTML.
          }
        }
        page = fetchedPage(fetchResult, structuredData);
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
    };

    yield { type: 'crawl_complete', url, page: null, total, success: result.success, error: result.error, metadata: { result } };
  }

  toString(): string {
    return `Kloakd(organizationId=${this._transport._organizationId}, baseUrl=${this._transport._baseUrl})`;
  }
}
