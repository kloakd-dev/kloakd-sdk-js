import type { HttpTransport } from '../_http.js';
import type { ExtractionResult } from '../models.js';

function parseExtraction(raw: Record<string, unknown>, url: string): ExtractionResult {
  const result = {
    success: Boolean(raw['success']),
    url: (raw['url'] as string | undefined) ?? url,
    method: (raw['method'] as string | undefined) ?? 'unknown',
    records: (raw['records'] as Record<string, unknown>[] | undefined) ?? [],
    totalRecords: Number(raw['total_records'] ?? 0),
    pagesScraped: Number(raw['pages_scraped'] ?? 0),
    artifactId: (raw['artifact_id'] as string | undefined) ?? null,
    jobId: (raw['job_id'] as string | undefined) ?? null,
    error: (raw['error'] as string | undefined) ?? null,
    hasMore: Boolean(raw['has_more']),
    total: Number(raw['total'] ?? 0),
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}

export interface PageOptions {
  schema?: Record<string, string>;
  fetchArtifactId?: string;
  sessionArtifactId?: string;
  apiMapArtifactId?: string;
  options?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

export class KolektrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  async page(url: string, opts: PageOptions = {}): Promise<ExtractionResult> {
    const body: Record<string, unknown> = {
      url,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
    };
    if (opts.schema) body['schema'] = opts.schema;
    if (opts.fetchArtifactId) body['fetch_artifact_id'] = opts.fetchArtifactId;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    if (opts.apiMapArtifactId) body['api_map_artifact_id'] = opts.apiMapArtifactId;
    if (opts.options) body['options'] = opts.options;
    const raw = await this._t.post('kolektr/extract', body);
    return parseExtraction(raw, url);
  }

  async pageAll(url: string, opts: Omit<PageOptions, 'limit' | 'offset'> = {}): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let offset = 0;
    while (true) {
      const result = await this.page(url, { ...opts, limit: 100, offset });
      all.push(...result.records);
      if (!result.hasMore) break;
      offset += result.records.length;
    }
    return all;
  }

  async extractHtml(
    html: string,
    url: string,
    opts: { schema?: Record<string, string> } = {},
  ): Promise<ExtractionResult> {
    const body: Record<string, unknown> = { html, url };
    if (opts.schema) body['schema'] = opts.schema;
    const raw = await this._t.post('kolektr/extract/html', body);
    return parseExtraction(raw, url);
  }
}
