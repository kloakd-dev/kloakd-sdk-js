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

  async getApiData(apiEndpoint: string): Promise<Record<string, unknown>> {
    return this._t.get(`kolektr/api-data/${apiEndpoint}`);
  }

  async getApiDataPaginated(apiEndpoint: string, offset = 0, limit = 1000): Promise<Record<string, unknown>> {
    return this._t.get(`kolektr/api-data/${apiEndpoint}/paginated`, { offset: String(offset), limit: String(limit) });
  }

  async extractAllApiData(apiEndpoint: string): Promise<Record<string, unknown>> {
    return this._t.post(`kolektr/api-data/${apiEndpoint}/extract-all`, {});
  }

  async listContent(): Promise<Record<string, unknown>> { return this._t.get('kolektr/content'); }
  async getContent(itemId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/content/${itemId}`); }
  async deleteContent(itemId: string): Promise<void> { await this._t.delete(`kolektr/content/${itemId}`); }

  async listJobs(): Promise<Record<string, unknown>> { return this._t.get('kolektr/jobs'); }
  async createJob(config: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.post('kolektr/jobs', config); }
  async getJob(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/jobs/${jobId}`); }
  async getJobStatus(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/extraction-jobs/${jobId}/status`); }
  async getJobProgress(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/jobs/${jobId}/progress`); }
  async getJobProgressEvents(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/jobs/${jobId}/progress/events`); }
  async getJobProgressLatest(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/jobs/${jobId}/progress/latest`); }
  async getJobProgressSummary(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/jobs/${jobId}/progress/summary`); }

  async getPipelineEvents(pipelineId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/pipeline/${pipelineId}/events`); }
  async getPipelineStream(pipelineId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/pipeline/${pipelineId}/stream`); }

  async listProgressPhases(): Promise<Record<string, unknown>> { return this._t.get('kolektr/progress/phases'); }
  async getProgressPhase(phaseName: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/progress/phases/${phaseName}`); }
  async getProgressPhaseSteps(phaseName: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/progress/phases/${phaseName}/steps`); }
  async getProgressSummary(): Promise<Record<string, unknown>> { return this._t.get('kolektr/progress/summary'); }

  async listScrapers(): Promise<Record<string, unknown>> { return this._t.get('kolektr/scrapers'); }
  async createScraper(config: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.post('kolektr/scrapers', config); }
  async getScraper(scraperId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/scrapers/${scraperId}`); }
  async updateScraper(scraperId: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.patch(`kolektr/scrapers/${scraperId}`, updates); }
  async deleteScraper(scraperId: string): Promise<void> { await this._t.delete(`kolektr/scrapers/${scraperId}`); }
}
