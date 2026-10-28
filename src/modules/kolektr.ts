import type { HttpTransport } from '../_http.js';
import { postFollowingHandoff } from '../_handoff.js';
import type { HandoffOptions } from '../_handoff.js';
import type { ExtractionResult } from '../models.js';
import { query, seg } from '../_params.js';

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
    authRequired: Boolean(raw['auth_required']),
    discoveryId: (raw['discovery_id'] as string | undefined) ?? null,
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

/** An extraction schema: the API's spec, a list of fields, or the `{ field: "css:selector" }` shorthand. */
export type ExtractSchema = SchemaSpec | FieldSpec[] | Record<string, string>;

/**
 * The extraction schema as the API takes it (`schema_spec`,
 * modules/kolektr/router.py SchemaSpec). Accepts the spec itself, a list of
 * fields, or the shorthand `{ fieldName: "css:selector" }`, whose `css:`
 * prefix is optional and removed.
 */
export function toSchemaSpec(schema: ExtractSchema): Record<string, unknown> {
  if (Array.isArray(schema)) return { fields: schema };
  if (Array.isArray((schema as SchemaSpec).fields)) {
    const s = schema as SchemaSpec;
    const spec: Record<string, unknown> = { fields: s.fields };
    if (s.pagination !== undefined) spec['pagination'] = s.pagination;
    if (s.maxPages !== undefined) spec['max_pages'] = s.maxPages;
    if (s.outputFormat !== undefined) spec['output_format'] = s.outputFormat;
    return spec;
  }
  return {
    fields: Object.entries(schema as Record<string, string>).map(([name, selector]) => ({
      name,
      selector: String(selector).replace(/^css:/, ''),
    })),
  };
}

/** Extraction options; the poll options apply when the API hands the extraction off as a job (202). */
export interface PageOptions extends HandoffOptions {
  schema?: ExtractSchema;
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
    opts: { schema?: ExtractSchema } = {},
  ): Promise<ExtractionResult> {
    const body: Record<string, unknown> = { html, url };
    if (opts.schema) body['schema_spec'] = toSchemaSpec(opts.schema);
    const raw = await this._t.post('kolektr/extract/html', body);
    return parseExtraction(raw, url);
  }

  /** Records of a detected API endpoint (the endpoint URL is sent URL-encoded). */
  async getApiData(apiEndpoint: string, opts: { endpointHash?: string } = {}): Promise<Record<string, unknown>> {
    return this._t.get(`kolektr/api-data/${seg(apiEndpoint)}`, query({ endpoint_hash: opts?.endpointHash }));
  }

  async getApiDataPaginated(
    apiEndpoint: string,
    offset = 0,
    limit = 1000,
    opts: { endpointHash?: string } = {},
  ): Promise<Record<string, unknown>> {
    return this._t.get(
      `kolektr/api-data/${seg(apiEndpoint)}/paginated`,
      query({ offset, limit, endpoint_hash: opts?.endpointHash }),
    );
  }

  /** Start a job extracting every record of an API endpoint. */
  async extractAllApiData(
    apiEndpoint: string,
    opts: { endpointHash?: string; maxRecords?: number } = {},
  ): Promise<Record<string, unknown>> {
    const params = query({ endpoint_hash: opts?.endpointHash, max_records: opts?.maxRecords });
    return this._t.request('POST', `kolektr/api-data/${seg(apiEndpoint)}/extract-all`, {}, params);
  }

  /** Content items: `{items, total, page, page_size}`. */
  async listContent(opts: { page?: number; pageSize?: number; search?: string } = {}): Promise<Record<string, unknown>> {
    return this._t.get('kolektr/content', query({ page: opts?.page, page_size: opts?.pageSize, search: opts?.search }));
  }
  async getContent(itemId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/content/${seg(itemId)}`); }
  async deleteContent(itemId: string): Promise<void> { await this._t.delete(`kolektr/content/${seg(itemId)}`); }

  /** Extraction jobs: `{jobs, total, page, limit}`. */
  async listJobs(opts: { page?: number; limit?: number; statusFilter?: string } = {}): Promise<Record<string, unknown>> {
    return this._t.get('kolektr/jobs', query({ page: opts?.page, limit: opts?.limit, status_filter: opts?.statusFilter }));
  }
  async getJob(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/jobs/${seg(jobId)}`); }
  async getJobStatus(jobId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/extraction-jobs/${seg(jobId)}/status`); }

  /** Scraper configs: `{scrapers, total, page, page_size, has_next, has_prev}`. */
  async listScrapers(opts: { page?: number; pageSize?: number; isTemplate?: boolean } = {}): Promise<Record<string, unknown>> {
    return this._t.get('kolektr/scrapers', query({ page: opts?.page, page_size: opts?.pageSize, is_template: opts?.isTemplate }));
  }
  async createScraper(config: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.post('kolektr/scrapers', config); }
  async getScraper(scraperId: string): Promise<Record<string, unknown>> { return this._t.get(`kolektr/scrapers/${seg(scraperId)}`); }
  async updateScraper(scraperId: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.patch(`kolektr/scrapers/${seg(scraperId)}`, updates); }
  async deleteScraper(scraperId: string): Promise<void> { await this._t.delete(`kolektr/scrapers/${seg(scraperId)}`); }
}
