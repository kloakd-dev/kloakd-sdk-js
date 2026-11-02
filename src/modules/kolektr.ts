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

/**
 * A field to extract: a name, and where to find it on the page.
 *
 * - `selector`: CSS. With an item selector it is read inside each item
 *   element; without one, against the whole page. A field with no selector
 *   is read from the item element itself.
 * - `attribute`: read this attribute instead of the text (for example `href`).
 * - `type`: `"list"` gives every match as a list; any other value (default
 *   `"text"`) gives the first match. No match gives `null`.
 */
export interface FieldSpec {
  name: string;
  selector?: string;
  attribute?: string;
  type?: string;
}

/** The API's extraction schema (modules/kolektr/router.py SchemaSpec). */
export interface SchemaSpec {
  fields: FieldSpec[];
  /**
   * CSS selector for the repeated item on a list page (for example
   * `article.product_pod`): one record per matching element, each field read
   * inside it. Sent as `item_selector`. Without it the response is one record
   * for the page, as in 0.5.0. The API answers 422 for an empty or invalid
   * selector, or an item selector with no fields.
   */
  itemSelector?: string;
  pagination?: boolean;
  maxPages?: number;
  outputFormat?: string;
}

/**
 * A field in the shorthand: a selector string (`"css:h3 a"`, the `css:`
 * prefix is optional) or the field's selector, attribute and type.
 */
export type ShorthandField = string | Omit<FieldSpec, 'name'>;

/** An extraction schema: the API's spec, a list of fields, or the `{ field: "css:selector" }` shorthand. */
export type ExtractSchema = SchemaSpec | FieldSpec[] | Record<string, ShorthandField>;

function stripCss(selector: string): string {
  return selector.replace(/^css:/, '');
}

function shorthandField(name: string, value: ShorthandField): FieldSpec {
  if (typeof value === 'string') return { name, selector: stripCss(value) };
  const field: FieldSpec = { name };
  if (value.selector !== undefined) field.selector = stripCss(String(value.selector));
  if (value.attribute !== undefined) field.attribute = value.attribute;
  if (value.type !== undefined) field.type = value.type;
  return field;
}

/**
 * The extraction schema as the API takes it (`schema_spec`,
 * modules/kolektr/router.py SchemaSpec). Accepts the spec itself, a list of
 * fields, or the shorthand `{ fieldName: "css:selector" }`, whose `css:`
 * prefix is optional and removed.
 *
 * `itemSelector` (GAP-API-11) makes one record per element it matches; it
 * applies to any of the three forms and takes the place of a spec's own
 * `itemSelector`. Throws for an empty item selector or one with no fields
 * (the API would answer 422). Invalid CSS is left to the API's 422.
 */
export function toSchemaSpec(schema: ExtractSchema, itemSelector?: string): Record<string, unknown> {
  let spec: Record<string, unknown>;
  let specItemSelector: string | undefined;
  if (Array.isArray(schema)) {
    spec = { fields: schema };
  } else if (Array.isArray((schema as SchemaSpec).fields)) {
    const s = schema as SchemaSpec;
    spec = { fields: s.fields };
    specItemSelector = s.itemSelector ?? (s as unknown as Record<string, string | undefined>)['item_selector'];
    if (s.pagination !== undefined) spec['pagination'] = s.pagination;
    if (s.maxPages !== undefined) spec['max_pages'] = s.maxPages;
    if (s.outputFormat !== undefined) spec['output_format'] = s.outputFormat;
  } else {
    spec = {
      fields: Object.entries(schema as Record<string, ShorthandField>).map(([name, value]) => shorthandField(name, value)),
    };
  }
  const selector = itemSelector ?? specItemSelector;
  if (selector !== undefined) {
    const trimmed = String(selector).trim();
    if (!trimmed) throw new Error('Kloakd: itemSelector must not be empty');
    if ((spec['fields'] as unknown[]).length === 0) throw new Error('Kloakd: itemSelector needs at least one field');
    spec['item_selector'] = trimmed;
  }
  return spec;
}

/** Extraction options; the poll options apply when the API hands the extraction off as a job (202). */
export interface PageOptions extends HandoffOptions {
  schema?: ExtractSchema;
  level?: string;
  fetchArtifactId?: string;
  sessionArtifactId?: string;
  apiMapArtifactId?: string;
  options?: Record<string, unknown>;
  /** One record per element this CSS selector matches; see `SchemaSpec.itemSelector`. Needs `schema`. */
  itemSelector?: string;
}

/** Options for `extractHtml`. */
export interface ExtractHtmlOptions {
  schema?: ExtractSchema;
  /** One record per element this CSS selector matches; see `SchemaSpec.itemSelector`. Needs `schema`. */
  itemSelector?: string;
}

function schemaBody(body: Record<string, unknown>, opts: { schema?: ExtractSchema; itemSelector?: string }): void {
  if (opts.schema) body['schema_spec'] = toSchemaSpec(opts.schema, opts.itemSelector);
  else if (opts.itemSelector !== undefined) throw new Error('Kloakd: itemSelector needs a schema with at least one field');
}

export class KolektrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /**
   * Extract structured data from a URL (`POST kolektr/extract`). An
   * extraction still running after about 85 s is handed off as a job (202);
   * this follows it and returns the same result.
   *
   * With `itemSelector` a list page gives one record per item:
   *
   * ```ts
   * const r = await kloakd.kolektr.page('https://books.toscrape.com/', {
   *   schema: { title: { selector: 'h3 a', attribute: 'title' }, price: 'css:p.price_color' },
   *   itemSelector: 'article.product_pod',
   * });
   * r.records; // [{ title: 'A Light in the Attic', price: '£51.77' }, ...] — one per book
   * ```
   */
  async page(url: string, opts: PageOptions = {}): Promise<ExtractionResult> {
    const body: Record<string, unknown> = { url };
    schemaBody(body, opts);
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

  /** Extract from HTML you already have (`POST kolektr/extract/html`); `itemSelector` as in `page`. */
  async extractHtml(
    html: string,
    url: string,
    opts: ExtractHtmlOptions = {},
  ): Promise<ExtractionResult> {
    const body: Record<string, unknown> = { html, url };
    schemaBody(body, opts);
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
