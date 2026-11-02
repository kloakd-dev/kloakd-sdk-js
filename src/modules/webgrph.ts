import type { HttpTransport } from '../_http.js';
import { seg } from '../_params.js';
import { JobFailedError, JobTimeoutError } from '../errors.js';
import type { CrawlEvent, CrawlResult, PageNode } from '../models.js';
import { parsePipelineEvent } from '../_events.js';

function parsePageNode(n: Record<string, unknown>): PageNode {
  const metadata = (n['metadata'] as Record<string, unknown> | undefined) ?? {};
  return {
    url: String(n['url'] ?? ''),
    depth: Number(n['depth'] ?? 0),
    title: (metadata['title'] as string | undefined) ?? (n['title'] as string | undefined) ?? null,
    statusCode: n['status_code'] != null ? Number(n['status_code']) : null,
    children: (n['children_urls'] as string[] | undefined) ?? (n['children'] as string[] | undefined) ?? [],
    parentUrl: (n['parent_url'] as string | undefined) ?? null,
    isGrouping: Boolean(metadata['is_grouping'] ?? n['is_grouping'] ?? false),
    crawlParentUrl:
      (metadata['crawl_parent_url'] as string | undefined) ?? (n['crawl_parent_url'] as string | undefined) ?? null,
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
   * Crawl a site: start it, wait until it finishes, and load every page of
   * its hierarchy. With `wait: false` the result carries only the crawl id.
   */
  async crawl(url: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
    const crawlId = await this.startCrawl(url, opts);
    if (opts.wait === false) {
      return crawlResult({ crawl_id: crawlId, status: 'queued' }, url, []);
    }
    const interval = opts.pollIntervalMs ?? 3000;
    const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60 * 1000);
    let status = await this.getCrawlStatus(crawlId);
    while (!FINISHED.has(String(status['status'] ?? ''))) {
      if (Date.now() + interval > deadline) throw new JobTimeoutError(`Crawl ${crawlId} still running; check it with getCrawlStatus`, crawlId);
      await sleep(interval);
      status = await this.getCrawlStatus(crawlId);
    }
    if (status['status'] === 'failed') {
      throw new JobFailedError(String(status['error'] ?? 'Crawl failed'), crawlId);
    }
    return crawlResult(
      status,
      url,
      await this.crawlAllPages(crawlId, opts.includeGrouping ? { includeGrouping: true } : {}),
    );
  }

  /** Every page node of a finished crawl. */
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
    hasMore: false,
    total: pages.length,
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}
