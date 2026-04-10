import type { HttpTransport } from '../_http.js';
import type { CrawlEvent, CrawlResult, PageNode } from '../models.js';

function parsePageNode(n: Record<string, unknown>): PageNode {
  return {
    url: String(n['url'] ?? ''),
    depth: Number(n['depth'] ?? 0),
    title: (n['title'] as string | undefined) ?? null,
    statusCode: n['status_code'] != null ? Number(n['status_code']) : null,
    children: (n['children'] as string[] | undefined) ?? [],
  };
}

function parseCrawl(raw: Record<string, unknown>, url: string): CrawlResult {
  const pages = ((raw['pages'] as Record<string, unknown>[] | undefined) ?? []).map(parsePageNode);
  const result = {
    success: Boolean(raw['success']),
    crawlId: (raw['crawl_id'] as string | undefined) ?? '',
    url: (raw['url'] as string | undefined) ?? url,
    totalPages: Number(raw['total_pages'] ?? 0),
    maxDepthReached: Number(raw['max_depth_reached'] ?? 0),
    pages,
    artifactId: (raw['artifact_id'] as string | undefined) ?? null,
    error: (raw['error'] as string | undefined) ?? null,
    hasMore: Boolean(raw['has_more']),
    total: Number(raw['total'] ?? 0),
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}

export interface CrawlOptions {
  maxDepth?: number;
  maxPages?: number;
  includeExternalLinks?: boolean;
  sessionArtifactId?: string;
  limit?: number;
  offset?: number;
}

export class WebgrphNamespace {
  constructor(private readonly _t: HttpTransport) {}

  async crawl(url: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
    const body: Record<string, unknown> = {
      url,
      max_depth: opts.maxDepth ?? 3,
      max_pages: opts.maxPages ?? 100,
      include_external_links: opts.includeExternalLinks ?? false,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
    };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await this._t.post('webgrph/crawl', body);
    return parseCrawl(raw, url);
  }

  async crawlAll(url: string, opts: Omit<CrawlOptions, 'limit' | 'offset'> = {}): Promise<PageNode[]> {
    const all: PageNode[] = [];
    let offset = 0;
    while (true) {
      const result = await this.crawl(url, { ...opts, limit: 100, offset });
      all.push(...result.pages);
      if (!result.hasMore) break;
      offset += result.pages.length;
    }
    return all;
  }

  async *crawlStream(
    url: string,
    opts: { maxDepth?: number; maxPages?: number } = {},
  ): AsyncIterable<CrawlEvent> {
    const body: Record<string, unknown> = {
      url,
      max_depth: opts.maxDepth ?? 3,
      max_pages: opts.maxPages ?? 100,
    };
    for await (const data of this._t.stream('webgrph/crawl/stream', body)) {
      yield {
        type: String(data['type'] ?? ''),
        url: (data['url'] as string | undefined) ?? null,
        depth: data['depth'] != null ? Number(data['depth']) : null,
        pagesFound: data['pages_found'] != null ? Number(data['pages_found']) : null,
        metadata: (data['metadata'] as Record<string, unknown> | undefined) ?? {},
      };
    }
  }

  async getHierarchy(artifactId: string): Promise<Record<string, unknown>> {
    return this._t.get(`webgrph/hierarchy/${artifactId}`);
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return this._t.get(`webgrph/jobs/${jobId}`);
  }
}
