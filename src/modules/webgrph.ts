import type { HttpTransport } from '../_http.js';
import { query, seg } from '../_params.js';
import { JobFailedError, JobTimeoutError } from '../errors.js';
import type {
  CrawlContinueOptions,
  CrawlContinueResult,
  CrawlEstimate,
  CrawlEvent,
  CrawlExtractCancelResult,
  CrawlExtractContinueResult,
  CrawlExtractCrawl,
  CrawlExtractJob,
  CrawlExtractLinks,
  CrawlExtractPage,
  CrawlExtractPagesPage,
  CrawlExtractResultsPage,
  CrawlExtractRow,
  CrawlExtractSpec,
  CrawlExtractStatus,
  CrawlResult,
  ExportDownload,
  ExportFormat,
  PageNode,
  SavedExport,
} from '../models.js';
import { checkExportFormat, openExport, saveExport } from '../_download.js';

import { parsePipelineEvent } from '../_events.js';

function parsePageNode(n: Record<string, unknown>): PageNode {
  const metadata = (n['metadata'] as Record<string, unknown> | undefined) ?? {};
  return {
    url: String(n['url'] ?? ''),
    depth: Number(n['depth'] ?? 0),
    title: (metadata['title'] as string | undefined) ?? (n['title'] as string | undefined) ?? null,
    children: (n['children_urls'] as string[] | undefined) ?? (n['children'] as string[] | undefined) ?? [],
    parentUrl: (n['parent_url'] as string | undefined) ?? null,
    isGrouping: Boolean(metadata['is_grouping'] ?? n['is_grouping'] ?? false),
    fetchStatus: (metadata['fetch_status'] as string | undefined) ?? null,
    fetchError: (metadata['fetch_error'] as string | undefined) ?? null,
  };
}

/** The pages endpoint's default page size (modules/webgrph/router.py PAGES_DEFAULT_LIMIT). */
export const CRAWL_PAGES_DEFAULT_LIMIT = 100;
/** The pages endpoint's largest page size (modules/webgrph/router.py PAGES_MAX_LIMIT); more is a 422. */
export const CRAWL_PAGES_MAX_LIMIT = 1000;

/** Options for `getCrawlPages`. */
export interface CrawlPagesOptions {
  /** `nextCursor` from the previous page: a non-negative integer as a string (anything else is a 422). */
  cursor?: string;
  /** Nodes per page, 1–1000. The SDK sends 500 when unset (the API's own default is 100). */
  limit?: number;
  /**
   * Also list the tree's grouping folders (`isGrouping` true). They were not
   * fetched; by default only fetched pages are listed, each under the page
   * the crawl found it on, and `total` matches the crawl's `total_pages`.
   */
  includeGrouping?: boolean;
}

function checkPagesOptions(opts: CrawlPagesOptions): void {
  if (opts.limit !== undefined) {
    if (!Number.isInteger(opts.limit) || opts.limit < 1 || opts.limit > CRAWL_PAGES_MAX_LIMIT) {
      throw new RangeError(`Kloakd: limit must be an integer from 1 to ${CRAWL_PAGES_MAX_LIMIT}, got ${opts.limit}`);
    }
  }
}

const FINISHED = new Set(['completed', 'failed', 'cancelled']);
/**
 * A crawl paused because the organisation's quota ran out
 * (billing/held_work.py): not ended, and not moving until quota returns.
 */
const HELD = 'held_quota';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CrawlOptions {
  /** Unset: the API's default for the organisation's tier. */
  maxDepth?: number;
  /** Unset: the API's default for the organisation's tier. */
  maxPages?: number;
  includeExternalLinks?: boolean;
  sessionArtifactId?: string;
  fastMode?: boolean;
  captureMode?: string;
  scope?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  /** Wait for the crawl to finish and load its pages (default true). */
  wait?: boolean;
  /** When waiting, also load the grouping folders (see `CrawlPagesOptions.includeGrouping`). Not sent with the crawl. */
  includeGrouping?: boolean;
  pollIntervalMs?: number;
  /** How long to wait for the crawl before JobTimeoutError. Default 30 minutes. */
  timeoutMs?: number;
}

/** How `waitForCrawl` polls and what it loads. */
export interface CrawlWaitOptions {
  /** Default 3000 ms. */
  pollIntervalMs?: number;
  /** How long to wait for the crawl before JobTimeoutError. Default 30 minutes. */
  timeoutMs?: number;
  /** Also load the grouping folders (see `CrawlPagesOptions.includeGrouping`). */
  includeGrouping?: boolean;
}

// ── Crawl-extract ───────────────────────────────────────────────────────────

/** The results and pages routes' largest page size (crawl_extract_router.py); more is a 422. */
export const CRAWL_EXTRACT_MAX_LIMIT = 1000;

/** Options for `startCrawlExtract` / `crawlExtract` (crawl_extract_router.py CrawlExtractRequest). */
export interface CrawlExtractOptions {
  /** Unset: the tier's maximum; a given value is clamped to it. */
  maxDepth?: number;
  /** Unset: the tier's maximum; a given value is clamped to it. */
  maxPages?: number;
  includeExternalLinks?: boolean;
  sessionArtifactId?: string;
  captureMode?: string;
  scope?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  /** What to extract from each page. */
  extract?: CrawlExtractSpec;
}

/** Options for `estimateCrawl`: the values the crawl would be started with. */
export interface CrawlEstimateOptions {
  /** Unset: the tier's maximum; a given value is clamped to it. */
  maxDepth?: number;
  /** Unset: the tier's maximum; a given value is clamped to it. */
  maxPages?: number;
}

/** Options for `estimateCrawlExtract`. */
export interface CrawlExtractEstimateOptions extends CrawlEstimateOptions {
  extract?: CrawlExtractSpec;
}

/** How `waitForCrawlExtract` / `crawlExtract` poll. */
export interface CrawlExtractWaitOptions {
  /** Default 3000 ms. */
  pollIntervalMs?: number;
  /** How long to wait before JobTimeoutError. Default 60 minutes. */
  timeoutMs?: number;
}

/** Filters shared by the results and the export. */
export interface CrawlExtractFilters {
  /** A `shape` from the job's status (`shapes[].shape`): rows with that set of fields. */
  shape?: string;
  pageType?: string;
  /** `item` rows only, or `page` rows only. */
  kind?: 'item' | 'page';
}

export interface CrawlExtractResultsOptions extends CrawlExtractFilters {
  /** Rows per page, 1–1000 (the API's default is 100). */
  limit?: number;
  /** `nextCursor` of the page before. */
  cursor?: string;
}

export interface CrawlExtractPagesOptions {
  /** Pages per call, 1–1000 (the API's default is 100). */
  limit?: number;
  offset?: number;
  status?: 'extracted' | 'failed';
}

export interface CrawlExtractExportOptions extends CrawlExtractFilters {
  /** Default `json`. */
  format?: ExportFormat;
}

function checkLimit(limit: number | undefined): void {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > CRAWL_EXTRACT_MAX_LIMIT)) {
    throw new RangeError(`Kloakd: limit must be an integer from 1 to ${CRAWL_EXTRACT_MAX_LIMIT}, got ${limit}`);
  }
}

const str = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));
const num = (v: unknown): number | null => (v === undefined || v === null ? null : Number(v));
const bool = (v: unknown): boolean | null => (v === undefined || v === null ? null : Boolean(v));

function parseCrawlExtractCrawl(raw: unknown): CrawlExtractCrawl | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  return {
    status: str(c['status']),
    isPartial: bool(c['is_partial']),
    partialReason: str(c['partial_reason']),
    pagesDiscovered: num(c['pages_discovered']),
    pagesFetched: num(c['pages_fetched']),
    pagesUnfetched: num(c['pages_unfetched']),
    cancelled: Boolean(c['cancelled']),
    rootUnfetched: Boolean(c['root_unfetched']),
    error: str(c['error']),
    errorCode: str(c['error_code']),
  };
}

function parseLinks(raw: unknown): CrawlExtractLinks | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  return {
    status: String(l['status'] ?? ''),
    results: String(l['results'] ?? ''),
    pages: String(l['pages'] ?? ''),
    cancel: String(l['cancel'] ?? ''),
    export: (l['export'] as Record<string, string> | undefined) ?? {},
    crawlEvents: String(l['crawl_events'] ?? ''),
    events: String(l['events'] ?? ''),
  };
}

function parseCrawlExtractStatus(raw: Record<string, unknown>, jobId: string): CrawlExtractStatus {
  const progress = (raw['progress'] as Record<string, unknown> | undefined) ?? {};
  const status = {
    jobId: String(raw['job_id'] ?? jobId),
    crawlId: String(raw['crawl_id'] ?? ''),
    url: String(raw['url'] ?? ''),
    status: String(raw['status'] ?? ''),
    cancelRequested: Boolean(raw['cancel_requested']),
    progress: {
      pagesCrawled: Number(progress['pages_crawled'] ?? 0),
      pagesTotal: progress['pages_total'] != null ? Number(progress['pages_total']) : null,
      pagesExtracted: Number(progress['pages_extracted'] ?? 0),
      pagesFailed: Number(progress['pages_failed'] ?? 0),
      items: Number(progress['items'] ?? 0),
    },
    error: str(raw['error']),
    errorCode: str(raw['error_code']),
    request: (raw['request'] as Record<string, unknown> | undefined) ?? {},
    createdAt: str(raw['created_at']),
    startedAt: str(raw['started_at']),
    completedAt: str(raw['completed_at']),
    updatedAt: str(raw['updated_at']),
    links: parseLinks(raw['links']),
    pagesByMethod: (raw['pages_by_method'] as Record<string, number> | undefined) ?? {},
    shapes: ((raw['shapes'] as Record<string, unknown>[] | undefined) ?? []).map((s) => ({
      shape: String(s['shape'] ?? ''),
      kind: String(s['kind'] ?? ''),
      rows: Number(s['rows'] ?? 0),
      pageTypes: (s['page_types'] as string[] | undefined) ?? [],
      fields: (s['fields'] as string[] | undefined) ?? [],
    })),
    crawl: parseCrawlExtractCrawl(raw['crawl']),
    timeBudgetS: num(raw['time_budget_s']),
    elapsedS: num(raw['elapsed_s']),
    estRemainingS: num(raw['est_remaining_s']),
  };
  return {
    ...status,
    get held() { return status.crawl?.status === HELD && !FINISHED.has(status.status); },
    get finished() { return FINISHED.has(status.status); },
    get ok() { return status.status === 'completed'; },
  };
}

function parseCrawlExtractRow(r: Record<string, unknown>): CrawlExtractRow {
  return {
    pageUrl: String(r['page_url'] ?? ''),
    pageType: str(r['page_type']),
    rowKind: String(r['row_kind'] ?? ''),
    itemIndex: Number(r['item_index'] ?? 0),
    data: (r['data'] as Record<string, unknown> | undefined) ?? {},
    shape: str(r['shape']),
  };
}

function parseCrawlExtractPage(p: Record<string, unknown>): CrawlExtractPage {
  return {
    pageSeq: Number(p['page_seq'] ?? 0),
    pageUrl: String(p['page_url'] ?? ''),
    pageType: str(p['page_type']),
    title: str(p['title']),
    status: String(p['status'] ?? ''),
    method: str(p['method']),
    itemCount: Number(p['item_count'] ?? 0),
    detail: p['detail'] ?? null,
    extractedAt: str(p['extracted_at']),
  };
}

function extractBody(spec: CrawlExtractSpec): Record<string, unknown> {
  const extract: Record<string, unknown> = {};
  if (spec.entityType) extract['entity_type'] = spec.entityType;
  if (spec.fields) extract['fields'] = spec.fields;
  if (spec.schema) {
    const schema: Record<string, unknown> = { fields: spec.schema.fields };
    if (spec.schema.itemSelector) schema['item_selector'] = spec.schema.itemSelector;
    extract['schema'] = schema;
  }
  return extract;
}

/** The continue body: only the values given; undefined when none is, so no body is sent. */
function continueBody(opts: CrawlContinueOptions): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {};
  if (opts.maxPages !== undefined) body['max_pages'] = opts.maxPages;
  if (opts.maxDepth !== undefined) body['max_depth'] = opts.maxDepth;
  return Object.keys(body).length > 0 ? body : undefined;
}

function parseCrawlEstimate(raw: Record<string, unknown>, url: string): CrawlEstimate {
  const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const limits = obj(raw['plan_limits']);
  const site = obj(raw['site']);
  const pages = obj(raw['est_pages']);
  const duration = obj(raw['est_duration_s']);
  return {
    mode: String(raw['mode'] ?? ''),
    url: String(raw['url'] ?? url),
    maxDepth: Number(raw['max_depth'] ?? 0),
    maxPages: Number(raw['max_pages'] ?? 0),
    planLimits: { maxDepth: num(limits['max_depth']), maxPages: num(limits['max_pages']), planTier: str(limits['plan_tier']) },
    clamped: Boolean(raw['clamped']),
    site: {
      reachable: Boolean(site['reachable']),
      sitemapPages: num(site['sitemap_pages']),
      homepageLinks: num(site['homepage_links']),
      probeError: str(site['probe_error']),
    },
    estPages: { low: Number(pages['low'] ?? 0), high: Number(pages['high'] ?? 0), source: String(pages['source'] ?? '') },
    willHitPageCap: Boolean(raw['will_hit_page_cap']),
    timeBudgetS: Number(raw['time_budget_s'] ?? 0),
    estDurationS: { low: Number(duration['low'] ?? 0), high: Number(duration['high'] ?? 0) },
    estGb: Number(raw['est_gb'] ?? 0),
    gbRemaining: num(raw['gb_remaining']),
    willExhaustQuota: Boolean(raw['will_exhaust_quota']),
    warning: str(raw['warning']),
    explanation: String(raw['explanation'] ?? ''),
  };
}

function filterParams(opts: CrawlExtractFilters): Record<string, string | undefined> {
  return { shape: opts.shape, page_type: opts.pageType, kind: opts.kind };
}

export class WebgrphNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /** Start a crawl (the API answers 202 with its id). */
  async startCrawl(url: string, opts: CrawlOptions = {}): Promise<string> {
    // max_depth / max_pages are sent only when set: the API then uses the tier's defaults.
    const body: Record<string, unknown> = { url, include_external_links: opts.includeExternalLinks ?? false };
    if (opts.maxDepth !== undefined) body['max_depth'] = opts.maxDepth;
    if (opts.maxPages !== undefined) body['max_pages'] = opts.maxPages;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    if (opts.fastMode !== undefined) body['fast_mode'] = opts.fastMode;
    if (opts.captureMode) body['capture_mode'] = opts.captureMode;
    if (opts.scope) body['scope'] = opts.scope;
    if (opts.budget) body['budget'] = opts.budget;
    const raw = await this._t.post('webgrph/crawl', body);
    return String(raw['crawl_id'] ?? '');
  }

  /**
   * Estimate a crawl before starting it (`POST webgrph/crawl/estimate`):
   * the depth and page cap after clamping to the plan, the pages the site
   * seems to have, the pages the crawl would fetch, a duration range, the
   * data use against what the plan has left, any warning, and what a crawl
   * does. Not metered: no charge and no work slot. Start the crawl with the
   * same options (`startCrawl` / `crawl`) when the estimate suits.
   */
  async estimateCrawl(url: string, opts: CrawlEstimateOptions = {}): Promise<CrawlEstimate> {
    const body: Record<string, unknown> = { url };
    if (opts.maxDepth !== undefined) body['max_depth'] = opts.maxDepth;
    if (opts.maxPages !== undefined) body['max_pages'] = opts.maxPages;
    return parseCrawlEstimate(await this._t.post('webgrph/crawl/estimate', body), url);
  }

  /**
   * Crawl a site: start it, wait until it finishes, and load every page of
   * its hierarchy. With `wait: false` the result carries only the crawl id.
   * The outcomes are those of `waitForCrawl`: check `held` and `isPartial`
   * as well as `ok`.
   */
  async crawl(url: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
    const crawlId = await this.startCrawl(url, opts);
    if (opts.wait === false) {
      return crawlResult({ crawl_id: crawlId, status: 'queued' }, url, []);
    }
    return this.waitFor(crawlId, url, opts);
  }

  /**
   * Wait for a crawl by its id and load its pages. It returns when the crawl:
   *
   * - completed (`ok` true). A crawl that stopped before asking for every
   *   page it found also completes: `isPartial` is then true, with
   *   `partialReason`, and `resumable` says whether `continueCrawl` can
   *   carry it on.
   * - was cancelled (`status` `cancelled`; the pages it has are loaded).
   * - is held (`held` true, `status` `held_quota`): the organisation's quota
   *   ran out, so the API paused the crawl. It has not failed. `message`
   *   says why; `pages` is empty. The crawl resumes by itself under the
   *   same id when quota returns (an upgrade, a top-up or the next billing
   *   period): call `waitForCrawl` again then. Held for 30 days, it ends as
   *   failed with error code `held_quota_expired`.
   *
   * Throws JobFailedError when the crawl failed and JobTimeoutError when it
   * is still running at `timeoutMs` (the crawl carries on).
   */
  async waitForCrawl(crawlId: string, opts: CrawlWaitOptions = {}): Promise<CrawlResult> {
    return this.waitFor(crawlId, '', opts);
  }

  private async waitFor(crawlId: string, url: string, opts: CrawlWaitOptions): Promise<CrawlResult> {
    const interval = opts.pollIntervalMs ?? 3000;
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60 * 1000);
    let status = await this.getCrawlStatus(crawlId);
    while (!FINISHED.has(String(status['status'] ?? '')) && status['status'] !== HELD) {
      if (Date.now() + interval > deadline) throw new JobTimeoutError(`Crawl ${crawlId} still running; check it with getCrawlStatus`, crawlId);
      await sleep(interval);
      status = await this.getCrawlStatus(crawlId);
    }
    if (status['status'] === 'failed') {
      throw new JobFailedError(String(status['error'] ?? 'Crawl failed'), crawlId);
    }
    if (status['status'] === HELD) {
      return crawlResult({ ...status, crawl_id: status['crawl_id'] ?? crawlId }, url, []);
    }
    return crawlResult(
      { ...status, crawl_id: status['crawl_id'] ?? crawlId },
      url,
      await this.crawlAllPages(crawlId, opts.includeGrouping ? { includeGrouping: true } : {}),
    );
  }

  /**
   * Carry on a crawl that stopped at its time budget
   * (`POST webgrph/crawl/{crawl_id}/continue`, answered 202): the crawl is
   * queued again under the same id and asks for the pages it had found and
   * not yet requested. Only for an ended crawl whose `resumable` is true;
   * any other crawl is a 409 (ApiError). It counts against the quota as a
   * crawl does (402, 409 or 429 when there is none). Wait for it with
   * `waitForCrawl(crawlId)`.
   *
   * With `maxPages` / `maxDepth` the crawl continues with those limits
   * (clamped to the plan; they may only be raised, a lower value is a 422
   * `continue_cannot_lower`). A crawl that stopped at `max_pages` can be
   * continued with a larger `maxPages`. Without options no body is sent and
   * the call is as before.
   */
  async continueCrawl(crawlId: string, opts: CrawlContinueOptions = {}): Promise<CrawlContinueResult> {
    const raw = await this._t.request('POST', `webgrph/crawl/${seg(crawlId)}/continue`, continueBody(opts));
    return {
      success: Boolean(raw['success']),
      crawlId: String(raw['crawl_id'] ?? crawlId),
      status: String(raw['status'] ?? ''),
    };
  }

  /**
   * Every page node of a crawl, started and waited for as `crawl` does. An
   * empty list when the crawl is held for quota (see `waitForCrawl`): use
   * `crawl` to tell that from a site with no pages.
   */
  async crawlAll(url: string, opts: Omit<CrawlOptions, 'wait'> = {}): Promise<PageNode[]> {
    return (await this.crawl(url, opts)).pages;
  }

  /**
   * Start a crawl and stream its pipeline events (Server-Sent Events). The
   * last is `pipeline_complete` (its `metadata.discovery_response` holds the
   * result) or `pipeline_error`.
   */
  async *crawlStream(url: string, opts: Omit<CrawlOptions, 'wait'> = {}): AsyncIterable<CrawlEvent> {
    const crawlId = await this.startCrawl(url, opts);
    for await (const data of this.crawlEvents(crawlId)) {
      yield { ...parsePipelineEvent(data), crawlId };
    }
  }

  async getCrawlStatus(crawlId: string): Promise<Record<string, unknown>> {
    return this._t.get(`webgrph/crawl/${seg(crawlId)}`);
  }

  async cancelCrawl(crawlId: string): Promise<Record<string, unknown>> {
    return this._t.post(`webgrph/crawl/${seg(crawlId)}/cancel`, {});
  }

  /** A crawl's progress events; `lastSequence` resumes after an event already seen. */
  crawlEvents(crawlId: string, lastSequence?: number): AsyncIterable<Record<string, unknown>> {
    return this._t.streamGet(
      `webgrph/crawl/${seg(crawlId)}/events`,
      lastSequence != null ? { last_sequence: String(lastSequence) } : undefined,
    );
  }

  /**
   * One page of a crawl's hierarchy; pass `nextCursor` back for the next.
   * By default only fetched pages are listed; `includeGrouping` adds the
   * display-only grouping folders. Throws RangeError for a limit outside
   * 1–1000; a cursor that is not a non-negative integer is the API's 422
   * (ApiError).
   */
  async getCrawlPages(
    crawlId: string,
    opts: CrawlPagesOptions = {},
  ): Promise<{ crawlId: string; nodes: PageNode[]; nextCursor: string | null; total: number }> {
    checkPagesOptions(opts);
    const params: Record<string, string> = { limit: String(opts.limit ?? 500) };
    if (opts.cursor) params['cursor'] = opts.cursor;
    if (opts.includeGrouping) params['include_grouping'] = 'true';
    const raw = await this._t.get(`webgrph/crawl/${seg(crawlId)}/pages`, params);
    return {
      crawlId: String(raw['crawl_id'] ?? crawlId),
      nodes: ((raw['nodes'] as Record<string, unknown>[] | undefined) ?? []).map(parsePageNode),
      nextCursor: (raw['next_cursor'] as string | undefined) ?? null,
      total: Number(raw['total'] ?? 0),
    };
  }

  /** Every page node of a crawl, following the cursor (`limit` and `includeGrouping` as in `getCrawlPages`). */
  async crawlAllPages(crawlId: string, opts: Omit<CrawlPagesOptions, 'cursor'> = {}): Promise<PageNode[]> {
    const all: PageNode[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.getCrawlPages(crawlId, cursor ? { ...opts, cursor } : { ...opts });
      all.push(...page.nodes);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }

  // ── Crawl-extract: crawl a site, extract every page, download the rows ──

  /**
   * Start a crawl-extract job (`POST webgrph/crawl-extract`, answered 202):
   * the API crawls `url` within the plan's limits and extracts each crawled
   * page. Needs the Kolektr module as well as Webgrph, and a live API key
   * (a test key is refused 403).
   */
  async startCrawlExtract(url: string, opts: CrawlExtractOptions = {}): Promise<CrawlExtractJob> {
    const body: Record<string, unknown> = { url };
    if (opts.maxDepth !== undefined) body['max_depth'] = opts.maxDepth;
    if (opts.maxPages !== undefined) body['max_pages'] = opts.maxPages;
    if (opts.includeExternalLinks !== undefined) body['include_external_links'] = opts.includeExternalLinks;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    if (opts.captureMode) body['capture_mode'] = opts.captureMode;
    if (opts.scope) body['scope'] = opts.scope;
    if (opts.budget) body['budget'] = opts.budget;
    if (opts.extract) body['extract'] = extractBody(opts.extract);
    const raw = await this._t.post('webgrph/crawl-extract', body);
    const limits = (raw['limits'] as Record<string, unknown> | undefined) ?? {};
    return {
      jobId: String(raw['job_id'] ?? ''),
      crawlId: String(raw['crawl_id'] ?? ''),
      url: String(raw['url'] ?? url),
      status: String(raw['status'] ?? ''),
      limits: {
        maxPages: limits['max_pages'] != null ? Number(limits['max_pages']) : null,
        maxDepth: limits['max_depth'] != null ? Number(limits['max_depth']) : null,
      },
      links: parseLinks(raw['links']),
    };
  }

  /**
   * Estimate a crawl-extract job before starting it
   * (`POST webgrph/crawl-extract/estimate`): as `estimateCrawl`, with the
   * extraction time per page in the duration. Needs the Kolektr module as
   * the job route does. Not metered.
   */
  async estimateCrawlExtract(url: string, opts: CrawlExtractEstimateOptions = {}): Promise<CrawlEstimate> {
    const body: Record<string, unknown> = { url };
    if (opts.maxDepth !== undefined) body['max_depth'] = opts.maxDepth;
    if (opts.maxPages !== undefined) body['max_pages'] = opts.maxPages;
    if (opts.extract) body['extract'] = extractBody(opts.extract);
    return parseCrawlEstimate(await this._t.post('webgrph/crawl-extract/estimate', body), url);
  }

  /**
   * Carry on a crawl-extract job whose crawl stopped early
   * (`POST webgrph/crawl-extract/{job_id}/continue`): the job's crawl
   * continues and the new pages are extracted. Options and errors are as
   * `continueCrawl`; without options no body is sent. Wait for the job with
   * `waitForCrawlExtract(jobId)`.
   */
  async continueCrawlExtract(jobId: string, opts: CrawlContinueOptions = {}): Promise<CrawlExtractContinueResult> {
    const raw = await this._t.request('POST', `webgrph/crawl-extract/${seg(jobId)}/continue`, continueBody(opts));
    return {
      success: Boolean(raw['success']),
      jobId: String(raw['job_id'] ?? jobId),
      crawlId: String(raw['crawl_id'] ?? ''),
      status: String(raw['status'] ?? ''),
    };
  }

  /** A crawl-extract job's stage, counters and row shapes. */
  async getCrawlExtract(jobId: string): Promise<CrawlExtractStatus> {
    return parseCrawlExtractStatus(await this._t.get(`webgrph/crawl-extract/${seg(jobId)}`), jobId);
  }

  /**
   * Poll a crawl-extract job until it ends and return its last status
   * (completed, failed or cancelled: check `ok`). It also returns, with
   * `held` true and `finished` false, when the job's crawl is paused
   * because the organisation's quota ran out: the job has not failed and
   * carries on by itself when quota returns, so wait again then. Throws
   * JobTimeoutError when it is still running at `timeoutMs`; the job
   * carries on.
   */
  async waitForCrawlExtract(jobId: string, opts: CrawlExtractWaitOptions = {}): Promise<CrawlExtractStatus> {
    const interval = opts.pollIntervalMs ?? 3000;
    const deadline = Date.now() + (opts.timeoutMs ?? 60 * 60 * 1000);
    for (;;) {
      const status = await this.getCrawlExtract(jobId);
      if (status.finished || status.held) return status;
      if (Date.now() + interval > deadline) {
        throw new JobTimeoutError(`Crawl-extract job ${jobId} still running; check it with getCrawlExtract`, jobId);
      }
      await sleep(interval);
    }
  }

  /**
   * Crawl a site and extract every page: start the job and wait until it
   * ends, or until its crawl is held for quota (`held` true: see
   * `waitForCrawlExtract`). Throws JobFailedError when it failed (the rows
   * it wrote can still be read and exported with the error's `jobId`).
   */
  async crawlExtract(url: string, opts: CrawlExtractOptions & CrawlExtractWaitOptions = {}): Promise<CrawlExtractStatus> {
    const job = await this.startCrawlExtract(url, opts);
    const status = await this.waitForCrawlExtract(job.jobId, opts);
    if (status.status === 'failed') throw new JobFailedError(status.error ?? 'Crawl-extract job failed', job.jobId);
    return status;
  }

  /**
   * One page of a job's rows, in page order then item order; pass
   * `nextCursor` back for the next. Rows appear while the job runs.
   */
  async getCrawlExtractResults(jobId: string, opts: CrawlExtractResultsOptions = {}): Promise<CrawlExtractResultsPage> {
    checkLimit(opts.limit);
    const raw = await this._t.get(
      `webgrph/crawl-extract/${seg(jobId)}/results`,
      query({ limit: opts.limit, cursor: opts.cursor, ...filterParams(opts) }),
    );
    return {
      jobId: String(raw['job_id'] ?? jobId),
      status: String(raw['status'] ?? ''),
      total: Number(raw['total'] ?? 0),
      count: Number(raw['count'] ?? 0),
      rows: ((raw['rows'] as Record<string, unknown>[] | undefined) ?? []).map(parseCrawlExtractRow),
      nextCursor: (raw['next_cursor'] as string | undefined) ?? null,
    };
  }

  /** Every row of a job, a page at a time, following the cursor. */
  async *iterCrawlExtractResults(jobId: string, opts: Omit<CrawlExtractResultsOptions, 'cursor'> = {}): AsyncIterable<CrawlExtractRow> {
    let cursor: string | undefined;
    do {
      const page = await this.getCrawlExtractResults(jobId, cursor ? { ...opts, cursor } : { ...opts });
      yield* page.rows;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  /** Every row of a job in memory (for a large job prefer `iterCrawlExtractResults` or an export). */
  async crawlExtractAllResults(jobId: string, opts: Omit<CrawlExtractResultsOptions, 'cursor'> = {}): Promise<CrawlExtractRow[]> {
    const all: CrawlExtractRow[] = [];
    for await (const row of this.iterCrawlExtractResults(jobId, opts)) all.push(row);
    return all;
  }

  /** The crawled pages of a job and how each was extracted (`offset` paging). */
  async getCrawlExtractPages(jobId: string, opts: CrawlExtractPagesOptions = {}): Promise<CrawlExtractPagesPage> {
    checkLimit(opts.limit);
    const raw = await this._t.get(
      `webgrph/crawl-extract/${seg(jobId)}/pages`,
      query({ limit: opts.limit, offset: opts.offset, status: opts.status }),
    );
    return {
      jobId: String(raw['job_id'] ?? jobId),
      status: String(raw['status'] ?? ''),
      count: Number(raw['count'] ?? 0),
      offset: Number(raw['offset'] ?? 0),
      pages: ((raw['pages'] as Record<string, unknown>[] | undefined) ?? []).map(parseCrawlExtractPage),
    };
  }

  /**
   * Download a job's rows as a stream (`format`: json, ndjson or csv). A job
   * that has not completed exports the rows it has (`jobStatus`). `crawl`
   * says what the rows cover, from the `X-Crawl-*` headers: whether the
   * crawl was partial, cancelled or never got its first page, and its
   * page counts.
   */
  async exportCrawlExtract(jobId: string, opts: CrawlExtractExportOptions = {}): Promise<ExportDownload> {
    const format = checkExportFormat(opts.format);
    return openExport(this._t, `webgrph/crawl-extract/${seg(jobId)}/export`, query({ format, ...filterParams(opts) }) ?? {});
  }

  /** Download a job's rows to a file, written as it arrives (Node.js only). */
  async downloadCrawlExtract(jobId: string, filePath: string, opts: CrawlExtractExportOptions = {}): Promise<SavedExport> {
    const format = checkExportFormat(opts.format);
    return saveExport(this._t, `webgrph/crawl-extract/${seg(jobId)}/export`, query({ format, ...filterParams(opts) }) ?? {}, filePath);
  }

  /**
   * Stop a job; rows already written stay. `status` is `cancelled`, or
   * `cancelling` while a worker still holds it. A job that has already
   * ended is a 409 (ApiError).
   */
  async cancelCrawlExtract(jobId: string): Promise<CrawlExtractCancelResult> {
    const raw = await this._t.post(`webgrph/crawl-extract/${seg(jobId)}/cancel`, {});
    return {
      success: Boolean(raw['success']),
      jobId: String(raw['job_id'] ?? jobId),
      crawlId: String(raw['crawl_id'] ?? ''),
      status: String(raw['status'] ?? ''),
    };
  }

  // ── Reader view, detected APIs, sessions ─────────────────────────────

  async readerView(url: string, opts: { crawlId?: string; sessionArtifactId?: string } = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { url };
    if (opts.crawlId) body['crawl_id'] = opts.crawlId;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    return this._t.post('webgrph/reader-view', body);
  }

  async detectedApis(pageUrl: string): Promise<Record<string, unknown>> {
    return this._t.get('webgrph/detected-apis', { page_url: pageUrl });
  }

  /** Discovery sessions; `activeOnly` defaults to true, as in the API, and is always sent. */
  async listSessions(opts: { activeOnly?: boolean } = {}): Promise<Record<string, unknown>[]> {
    return this._t.get<Record<string, unknown>[]>('webgrph/sessions', {
      active_only: String(opts?.activeOnly ?? true),
    });
  }

  async saveSession(session: {
    url: string;
    selectedNodes?: unknown[];
    hierarchyData?: Record<string, unknown>;
    sessionId?: string;
    lastCrawlId?: string;
  }): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { url: session.url, selected_nodes: session.selectedNodes ?? [] };
    if (session.hierarchyData) body['hierarchy_data'] = session.hierarchyData;
    if (session.sessionId) body['session_id'] = session.sessionId;
    if (session.lastCrawlId) body['last_crawl_id'] = session.lastCrawlId;
    return this._t.post('webgrph/sessions', body);
  }

  async getSession(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.get(`webgrph/sessions/${seg(sessionId)}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this._t.delete(`webgrph/sessions/${seg(sessionId)}`);
  }

  async endSession(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.post(`webgrph/sessions/${seg(sessionId)}/end`, {});
  }

  async updateSessionJob(sessionId: string, jobId: string): Promise<Record<string, unknown>> {
    return this._t.request('PATCH', `webgrph/sessions/${seg(sessionId)}/job`, undefined, { job_id: jobId });
  }
}

function crawlResult(status: Record<string, unknown>, url: string, pages: PageNode[]): CrawlResult {
  const result = {
    success: status['status'] === 'completed',
    crawlId: String(status['crawl_id'] ?? ''),
    status: String(status['status'] ?? ''),
    url,
    totalPages: Number(status['total_pages'] ?? pages.length),
    maxDepthReached: Number(status['max_depth_reached'] ?? 0),
    pages,
    artifactId: (status['artifact_id'] as string | undefined) ?? null,
    error: (status['error'] as string | undefined) ?? null,
    errorCode: str(status['error_code']),
    message: str(status['message']),
    held: status['status'] === HELD,
    isPartial: bool(status['is_partial']),
    partialReason: str(status['partial_reason']),
    resumable: bool(status['resumable']),
    pagesDiscovered: num(status['pages_discovered']),
    pagesFetched: num(status['pages_fetched']),
    pagesUnfetched: num(status['pages_unfetched']),
    timeBudgetS: num(status['time_budget_s']),
    elapsedS: num(status['elapsed_s']),
    estRemainingS: num(status['est_remaining_s']),
    hasMore: false,
    total: pages.length,
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}
