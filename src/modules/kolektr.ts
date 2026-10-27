import type { HttpTransport } from '../_http.js';
import { postFollowingHandoff } from '../_handoff.js';
import type { HandoffOptions } from '../_handoff.js';
import type { ExtractionResult } from '../models.js';

function parseExtraction(raw: Record<string, unknown>, url: string): ExtractionResult {
  const result = {
    success: Boolean(raw['success']),
    url: (raw['url'] as string | undefined) ?? url,
    method: (raw['method'] as string | undefined) ?? 'unknown',
    records: (raw['records'] as Record<string, unknown>[] | undefined) ?? [],
    totalRecords: Number(raw['total_records'] ?? 0),
    pagesScraped: Number(raw['pages_scraped'] ?? 0),
    artifactId: (raw['artifact'] as Record<string, unknown> | undefined)?.['artifact_id'] as string | undefined ?? (raw['artifact_id'] as string | undefined) ?? null,
    jobId: (raw['job_id'] as string | undefined) ?? null,
    error: (raw['error'] as string | undefined) ?? null,
    hasMore: Boolean(raw['has_more']),
    total: Number(raw['total'] ?? 0),
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}

/** A field to extract: a name, and where to find it on the page. */
export interface FieldSpec {
  name: string;
  selector?: string;
  attribute?: string;
  type?: string;
}

/** The API's extraction schema. */
export interface SchemaSpec {
  fields: FieldSpec[];
  pagination?: boolean;
  maxPages?: number;
  outputFormat?: string;
}

/**
 * The extraction schema as the API takes it (`schema_spec`). A plain
 * `{ fieldName: cssSelector }` map is accepted as shorthand.
 */
export function toSchemaSpec(schema: SchemaSpec | Record<string, string>): Record<string, unknown> {
  if (Array.isArray((schema as SchemaSpec).fields)) {
    const s = schema as SchemaSpec;
    const spec: Record<string, unknown> = { fields: s.fields };
    if (s.pagination !== undefined) spec['pagination'] = s.pagination;
    if (s.maxPages !== undefined) spec['max_pages'] = s.maxPages;
    if (s.outputFormat !== undefined) spec['output_format'] = s.outputFormat;
    return spec;
  }
  return {
    fields: Object.entries(schema as Record<string, string>).map(([name, selector]) => ({ name, selector })),
  };
}

/** Extraction options; the poll options apply when the API hands the extraction off as a job (202). */
export interface PageOptions extends HandoffOptions {
  schema?: SchemaSpec | Record<string, string>;
  level?: string;
  fetchArtifactId?: string;
  sessionArtifactId?: string;
  apiMapArtifactId?: string;
  options?: Record<string, unknown>;
}

export class KolektrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /**
   * Extract structured data from a URL (`POST kolektr/extract`). An
   * extraction still running after about 85 s is handed off as a job (202);
   * this follows it and returns the same result.
   */
  async page(url: string, opts: PageOptions = {}): Promise<ExtractionResult> {
    const body: Record<string, unknown> = { url };
    if (opts.schema) body['schema_spec'] = toSchemaSpec(opts.schema);
    if (opts.level) body['level'] = opts.level;
    if (opts.fetchArtifactId) body['fetch_artifact_id'] = opts.fetchArtifactId;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    if (opts.apiMapArtifactId) body['api_map_artifact_id'] = opts.apiMapArtifactId;
    if (opts.options) body['options'] = opts.options;
    return parseExtraction(await postFollowingHandoff(this._t, 'kolektr/extract', body, opts), url);
  }

  /** All records of a page's extraction (the API returns them in one response). */
  async pageAll(url: string, opts: PageOptions = {}): Promise<Record<string, unknown>[]> {
    return (await this.page(url, opts)).records;
  }

  async extractHtml(
    html: string,
    url: string,
    opts: { schema?: SchemaSpec | Record<string, string> } = {},
  ): Promise<ExtractionResult> {
    const body: Record<string, unknown> = { html, url };
    if (opts.schema) body['schema_spec'] = toSchemaSpec(opts.schema);
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
