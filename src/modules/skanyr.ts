import type { HttpTransport } from '../_http.js';
import { query, seg } from '../_params.js';

type Json = Record<string, unknown>;

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
    return this._t.post(`skanyr/sites/from-crawl/${seg(crawlId)}`, {});
  }

  async getSite(siteId: string): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}`);
  }

  /** Set a site's default sync policy: full, incremental, conditional or head_first. */
  async updateSite(siteId: string, policy: string): Promise<Json> {
    return this._t.patch(`skanyr/sites/${seg(siteId)}`, { policy });
  }

  async deleteSite(siteId: string): Promise<void> {
    await this._t.delete(`skanyr/sites/${seg(siteId)}`);
  }

  /** Re-fetch a site's changed content (all of it, or the given URLs). */
  async sync(siteId: string, opts: { urls?: string[]; policy?: string } = {}): Promise<Json> {
    const body: Json = { site_id: siteId };
    if (opts.urls) body['urls'] = opts.urls;
    if (opts.policy) body['policy'] = opts.policy;
    return this._t.post('skanyr/sync', body);
  }

  /** Export a site's captured content as a ZIP archive (its bytes). */
  async exportSite(siteId: string, opts: { resourceIds?: string[]; maxBytes?: number } = {}): Promise<Uint8Array> {
    const body: Json = {};
    if (opts.resourceIds) body['resource_ids'] = opts.resourceIds;
    if (opts.maxBytes !== undefined) body['max_bytes'] = opts.maxBytes;
    return this._t.requestBytes('POST', `skanyr/sites/${seg(siteId)}/export`, body);
  }

  async getSiteApis(siteId: string, opts: { limit?: number; offset?: number } = {}): Promise<Json[]> {
    return this._t.get<Json[]>(`skanyr/sites/${seg(siteId)}/apis`, query({ limit: opts.limit, offset: opts.offset }));
  }

  async getSiteResources(siteId: string, opts: { resourceType?: string; limit?: number; offset?: number } = {}): Promise<Json[]> {
    return this._t.get<Json[]>(`skanyr/sites/${seg(siteId)}/resources`, query({ resource_type: opts.resourceType, limit: opts.limit, offset: opts.offset }));
  }

  async searchSite(siteId: string, q: string, opts: { limit?: number; offset?: number; mimeType?: string } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/search`, query({ q, limit: opts.limit, offset: opts.offset, mime_type: opts.mimeType }));
  }

  async getFindings(siteId: string, opts: { findingKind?: string; limit?: number; offset?: number } = {}): Promise<Json[]> {
    return this._t.get<Json[]>(`skanyr/sites/${seg(siteId)}/findings`, query({ finding_kind: opts.findingKind, limit: opts.limit, offset: opts.offset }));
  }

  async getTechnologies(siteId: string): Promise<Json[]> {
    return this._t.get<Json[]>(`skanyr/sites/${seg(siteId)}/technologies`);
  }

  async getTechnologyEvidence(siteId: string, subject: string, opts: { detector?: string; limit?: number; offset?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/technology-evidence`, query({ subject, detector: opts.detector, limit: opts.limit, offset: opts.offset }));
  }

  // ── History ──────────────────────────────────────────────────────────

  async listSnapshots(siteId: string, opts: { limit?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/snapshots`, query({ limit: opts.limit }));
  }

  async getTimeline(siteId: string, opts: { limit?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/timeline`, query({ limit: opts.limit }));
  }

  async getTimelineSnapshot(siteId: string, snapshotId: string): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/timeline/${seg(snapshotId)}`);
  }

  async diff(siteId: string, opts: { snapshotA?: string; snapshotB?: string } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/diff`, query({ snapshot_a: opts.snapshotA, snapshot_b: opts.snapshotB }));
  }

  // ── Graph ────────────────────────────────────────────────────────────

  async getGraph(siteId: string, opts: { resourceType?: string; maxDepth?: number; edgeKind?: string; limit?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/graph`, query({ resource_type: opts.resourceType, max_depth: opts.maxDepth, edge_kind: opts.edgeKind, limit: opts.limit }));
  }

  async getGraphStats(siteId: string): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/graph/stats`);
  }

  async getSubgraph(siteId: string, resourceId: string, opts: { hops?: number } = {}): Promise<Json> {
    return this._t.get(`skanyr/sites/${seg(siteId)}/graph/subgraph/${seg(resourceId)}`, query({ hops: opts.hops }));
  }

  // ── Resources, search, extraction ────────────────────────────────────

  async listResources(opts: { siteId?: string; resourceType?: string; limit?: number; offset?: number } = {}): Promise<Json[]> {
    return this._t.get<Json[]>('skanyr/resources', query({ site_id: opts.siteId, resource_type: opts.resourceType, limit: opts.limit, offset: opts.offset }));
  }

  async getResource(resourceId: string): Promise<Json> {
    return this._t.get(`skanyr/resources/${seg(resourceId)}`);
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
    return this._t.get(`skanyr/extractions/${seg(contentHash)}/text`);
  }

  async getExtractionStructure(contentHash: string): Promise<Json> {
    return this._t.get(`skanyr/extractions/${seg(contentHash)}/structure`);
  }
}
