import type { HttpTransport } from '../_http.js';
import { JobFailedError, JobTimeoutError } from '../errors.js';
import type { CrawlEvent, CrawlResult, PageNode } from '../models.js';

function parsePageNode(n: Record<string, unknown>): PageNode {
  const metadata = (n['metadata'] as Record<string, unknown> | undefined) ?? {};
  return {
    url: String(n['url'] ?? ''),
    depth: Number(n['depth'] ?? 0),
    title: (metadata['title'] as string | undefined) ?? (n['title'] as string | undefined) ?? null,
    statusCode: n['status_code'] != null ? Number(n['status_code']) : null,
    children: (n['children_urls'] as string[] | undefined) ?? (n['children'] as string[] | undefined) ?? [],
  };
}

const FINISHED = new Set(['completed', 'failed', 'cancelled']);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  includeExternalLinks?: boolean;
  sessionArtifactId?: string;
  fastMode?: boolean;
  captureMode?: string;
  scope?: Record<string, unknown>;
  budget?: Record<string, unknown>;
  /** Wait for the crawl to finish and load its pages (default true). */
  wait?: boolean;
  pollIntervalMs?: number;
  /** How long to wait for the crawl before JobTimeoutError. Default 30 minutes. */
  timeoutMs?: number;
}

export class WebgrphNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /** Start a crawl (the API answers 202 with its id). */
  async startCrawl(url: string, opts: CrawlOptions = {}): Promise<string> {
    const body: Record<string, unknown> = {
      url,
      max_depth: opts.maxDepth ?? 3,
      max_pages: opts.maxPages ?? 100,
      include_external_links: opts.includeExternalLinks ?? false,
    };
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
      if (Date.now() + interval > deadline) throw new JobTimeoutError(`Crawl ${crawlId} still running`, crawlId);
      await sleep(interval);
      status = await this.getCrawlStatus(crawlId);
    }
    if (status['status'] === 'failed') {
      throw new JobFailedError(String(status['error'] ?? 'Crawl failed'), crawlId);
    }
    return crawlResult(status, url, await this.crawlAllPages(crawlId));
  }

  /** Every page node of a finished crawl. */
  async crawlAll(url: string, opts: Omit<CrawlOptions, 'wait'> = {}): Promise<PageNode[]> {
    return (await this.crawl(url, opts)).pages;
  }

  /** Start a crawl and stream its progress events (Server-Sent Events). */
  async *crawlStream(url: string, opts: Omit<CrawlOptions, 'wait'> = {}): AsyncIterable<CrawlEvent> {
    const crawlId = await this.startCrawl(url, opts);
    for await (const data of this.crawlEvents(crawlId)) {
      yield {
        type: String(data['event_type'] ?? data['type'] ?? ''),
        url: (data['url'] as string | undefined) ?? null,
        depth: data['depth'] != null ? Number(data['depth']) : null,
        pagesFound: data['pages_found'] != null ? Number(data['pages_found']) : null,
        metadata: { crawlId, ...((data['metadata'] as Record<string, unknown> | undefined) ?? data) },
      };
    }
  }

  async getCrawlStatus(crawlId: string): Promise<Record<string, unknown>> {
    return this._t.get(`webgrph/crawl/${crawlId}`);
  }

  async cancelCrawl(crawlId: string): Promise<Record<string, unknown>> {
    return this._t.post(`webgrph/crawl/${crawlId}/cancel`, {});
  }

  /** A crawl's progress events; `lastSequence` resumes after an event already seen. */
  crawlEvents(crawlId: string, lastSequence?: number): AsyncIterable<Record<string, unknown>> {
    return this._t.streamGet(
      `webgrph/crawl/${crawlId}/events`,
      lastSequence != null ? { last_sequence: String(lastSequence) } : undefined,
    );
  }

  /** One page of a crawl's hierarchy; pass `nextCursor` back for the next. */
  async getCrawlPages(
    crawlId: string,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ crawlId: string; nodes: PageNode[]; nextCursor: string | null; total: number }> {
    const params: Record<string, string> = { limit: String(opts.limit ?? 500) };
    if (opts.cursor) params['cursor'] = opts.cursor;
    const raw = await this._t.get(`webgrph/crawl/${crawlId}/pages`, params);
    return {
      crawlId: String(raw['crawl_id'] ?? crawlId),
      nodes: ((raw['nodes'] as Record<string, unknown>[] | undefined) ?? []).map(parsePageNode),
      nextCursor: (raw['next_cursor'] as string | undefined) ?? null,
      total: Number(raw['total'] ?? 0),
    };
  }

  /** Every page node of a crawl, following the cursor. */
  async crawlAllPages(crawlId: string): Promise<PageNode[]> {
    const all: PageNode[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.getCrawlPages(crawlId, cursor ? { cursor } : {});
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

  async listSessions(opts: { activeOnly?: boolean } = {}): Promise<Record<string, unknown>[]> {
    return this._t.get<Record<string, unknown>[]>(
      'webgrph/sessions',
      opts.activeOnly !== undefined ? { active_only: String(opts.activeOnly) } : undefined,
    );
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
    return this._t.get(`webgrph/sessions/${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this._t.delete(`webgrph/sessions/${sessionId}`);
  }

  async endSession(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.post(`webgrph/sessions/${sessionId}/end`, {});
  }

  async updateSessionJob(sessionId: string, jobId: string): Promise<Record<string, unknown>> {
    return this._t.request('PATCH', `webgrph/sessions/${sessionId}/job`, undefined, { job_id: jobId });
  }

  // ── Analytics ─────────────────────────────────────────────────────────

  async getDashboardSummary(): Promise<Record<string, unknown>> { return this._t.get('webgrph/analytics/dashboard/summary'); }
  async getErrorSummary(): Promise<Record<string, unknown>> { return this._t.get('webgrph/analytics/error-summary'); }
  async getJobTrends(): Promise<Record<string, unknown>> { return this._t.get('webgrph/analytics/job-trends'); }
  async getDiscoveryPatterns(): Promise<Record<string, unknown>> { return this._t.get('webgrph/analytics/content/discovery-patterns'); }
  async getEfficiencyMetrics(): Promise<Record<string, unknown>> { return this._t.get('webgrph/analytics/scraping/efficiency-metrics'); }
  async getSiteMappingTrends(): Promise<Record<string, unknown>> { return this._t.get('webgrph/analytics/site-maps/trends'); }
  async getUserBehaviorInsights(): Promise<Record<string, unknown>> { return this._t.get('webgrph/analytics/users/behavior-insights'); }
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
