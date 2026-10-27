import type { HttpTransport } from '../_http.js';

type Json = Record<string, unknown>;

/** Turn defined option values into query parameters. */
function query(params: Record<string, string | number | boolean | undefined>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) out[key] = String(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Skanyr — the site knowledge store: sites built from crawls, their
 * resources, search, change history, the resource graph and technology
 * findings. (The 0.2 discovery methods called routes the API no longer has;
 * page discovery is `webgrph.crawl`, and sessions, reader view and detected
 * APIs moved to `webgrph`.)
 */
export class SkanyrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  // ── Sites ────────────────────────────────────────────────────────────

  async listSites(): Promise<Json[]> {
    return this._t.get<Json[]>('skanyr/sites');
  }

  /** Build (or update) a site from a finished crawl. */
  async siteFromCrawl(crawlId: string): Promise<Json> {
    return this._t.post(`skanyr/sites/from-crawl/${crawlId}`, {});
  }

  async getSite(siteId: string): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}`);
  }

  async updateSite(siteId: string, update: { policy?: Json }): Promise<Json> {
    return this._t.patch(`skanyr/sites/${siteId}`, update.policy !== undefined ? { policy: update.policy } : {});
  }

  async deleteSite(siteId: string): Promise<void> {
    await this._t.delete(`skanyr/sites/${siteId}`);
  }

  /** Re-fetch a site's changed content (all of it, or the given URLs). */
  async sync(siteId: string, opts: { urls?: string[]; policy?: string } = {}): Promise<Json> {
    const body: Json = { site_id: siteId };
    if (opts.urls) body['urls'] = opts.urls;
    if (opts.policy) body['policy'] = opts.policy;
    return this._t.post('skanyr/sync', body);
  }

  async exportSite(siteId: string, opts: { resourceIds?: string[]; maxBytes?: number } = {}): Promise<Json> {
    const body: Json = {};
    if (opts.resourceIds) body['resource_ids'] = opts.resourceIds;
    if (opts.maxBytes !== undefined) body['max_bytes'] = opts.maxBytes;
    return this._t.post(`skanyr/sites/${siteId}/export`, body);
  }

  async getSiteApis(siteId: string, opts: { limit?: number; offset?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/apis`, query(opts));
  }

  async getSiteResources(siteId: string, opts: { resourceType?: string; limit?: number; offset?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/resources`, query({ resource_type: opts.resourceType, limit: opts.limit, offset: opts.offset }));
  }

  async searchSite(siteId: string, q: string, opts: { limit?: number; offset?: number; mimeType?: string } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/search`, query({ q, limit: opts.limit, offset: opts.offset, mime_type: opts.mimeType }));
  }

  async getFindings(siteId: string, opts: { findingKind?: string; limit?: number; offset?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/findings`, query({ finding_kind: opts.findingKind, limit: opts.limit, offset: opts.offset }));
  }

  async getTechnologies(siteId: string): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/technologies`);
  }

  async getTechnologyEvidence(siteId: string, subject: string, opts: { detector?: string; limit?: number; offset?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/technology-evidence`, query({ subject, detector: opts.detector, limit: opts.limit, offset: opts.offset }));
  }

  // ── History ──────────────────────────────────────────────────────────

  async listSnapshots(siteId: string, opts: { limit?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/snapshots`, query(opts));
  }

  async getTimeline(siteId: string, opts: { limit?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/timeline`, query(opts));
  }

  async getTimelineSnapshot(siteId: string, snapshotId: string): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/timeline/${snapshotId}`);
  }

  async diff(siteId: string, opts: { snapshotA?: string; snapshotB?: string } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/diff`, query({ snapshot_a: opts.snapshotA, snapshot_b: opts.snapshotB }));
  }

  // ── Graph ────────────────────────────────────────────────────────────

  async getGraph(siteId: string, opts: { resourceType?: string; maxDepth?: number; edgeKind?: string; limit?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/graph`, query({ resource_type: opts.resourceType, max_depth: opts.maxDepth, edge_kind: opts.edgeKind, limit: opts.limit }));
  }

  async getGraphStats(siteId: string): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/graph/stats`);
  }

  async getSubgraph(siteId: string, resourceId: string, opts: { hops?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${siteId}/graph/subgraph/${resourceId}`, query(opts));
  }

  // ── Resources, search, extraction ────────────────────────────────────

  async listResources(opts: { siteId?: string; resourceType?: string; limit?: number; offset?: number } = {}): Promise<Json> {
    return this._t.get('skanyr/resources', query({ site_id: opts.siteId, resource_type: opts.resourceType, limit: opts.limit, offset: opts.offset }));
  }

  async getResource(resourceId: string): Promise<Json> {
    return this._t.get(`skanyr/resources/${resourceId}`);
  }

  /** Full-text search across the organisation's stored content. */
  async search(q: string, opts: { siteId?: string; limit?: number; offset?: number; mimeType?: string } = {}): Promise<Json> {
    const body: Json = { query: q };
    if (opts.siteId) body['site_id'] = opts.siteId;
    if (opts.limit !== undefined) body['limit'] = opts.limit;
    if (opts.offset !== undefined) body['offset'] = opts.offset;
    if (opts.mimeType) body['mime_type'] = opts.mimeType;
    return this._t.post('skanyr/search', body);
  }

  /** Extract text and structure from stored content (by its content hash). */
  async extract(contentHash: string, mimeType: string, metadata: Json = {}): Promise<Json> {
    return this._t.post('skanyr/extract', { content_hash: contentHash, mime_type: mimeType, metadata });
  }

  async getExtractionText(contentHash: string): Promise<Json> {
    return this._t.get(`skanyr/extractions/${contentHash}/text`);
  }

  async getExtractionStructure(contentHash: string): Promise<Json> {
    return this._t.get(`skanyr/extractions/${contentHash}/structure`);
  }
}
