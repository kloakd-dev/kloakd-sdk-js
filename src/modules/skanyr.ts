import type { HttpTransport } from '../_http.js';
import type { ApiEndpoint, DiscoverEvent, DiscoverResult } from '../models.js';

function parseEndpoint(e: Record<string, unknown>): ApiEndpoint {
  return {
    url: String(e['url'] ?? ''),
    method: String(e['method'] ?? 'GET'),
    apiType: String(e['api_type'] ?? 'rest'),
    confidence: Number(e['confidence'] ?? 0),
    parameters: (e['parameters'] as Record<string, unknown> | undefined) ?? {},
  };
}

function parseDiscover(raw: Record<string, unknown>, url: string): DiscoverResult {
  const endpoints = ((raw['endpoints'] as Record<string, unknown>[] | undefined) ?? []).map(parseEndpoint);
  const result = {
    success: Boolean(raw['success']),
    discoveryId: (raw['discovery_id'] as string | undefined) ?? '',
    url: (raw['url'] as string | undefined) ?? url,
    totalEndpoints: Number(raw['total_endpoints'] ?? 0),
    endpoints,
    artifactId: (raw['artifact_id'] as string | undefined) ?? null,
    error: (raw['error'] as string | undefined) ?? null,
    hasMore: Boolean(raw['has_more']),
    total: Number(raw['total'] ?? 0),
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}

export interface DiscoverOptions {
  siteHierarchyArtifactId?: string;
  maxRequests?: number;
  sessionArtifactId?: string;
  limit?: number;
  offset?: number;
}

export class SkanyrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  async discover(url: string, opts: DiscoverOptions = {}): Promise<DiscoverResult> {
    const body: Record<string, unknown> = {
      url,
      max_requests: opts.maxRequests ?? 200,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
    };
    if (opts.siteHierarchyArtifactId) body['site_hierarchy_artifact_id'] = opts.siteHierarchyArtifactId;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await this._t.post('skanyr/discover', body);
    return parseDiscover(raw, url);
  }

  async discoverAll(url: string, opts: Omit<DiscoverOptions, 'limit' | 'offset'> = {}): Promise<ApiEndpoint[]> {
    const all: ApiEndpoint[] = [];
    let offset = 0;
    while (true) {
      const result = await this.discover(url, { ...opts, limit: 100, offset });
      all.push(...result.endpoints);
      if (!result.hasMore) break;
      offset += result.endpoints.length;
    }
    return all;
  }

  async *discoverStream(
    url: string,
    opts: { siteHierarchyArtifactId?: string; maxRequests?: number } = {},
  ): AsyncIterable<DiscoverEvent> {
    const body: Record<string, unknown> = { url, max_requests: opts.maxRequests ?? 200 };
    if (opts.siteHierarchyArtifactId) body['site_hierarchy_artifact_id'] = opts.siteHierarchyArtifactId;
    for await (const data of this._t.stream('skanyr/discover/stream', body)) {
      yield {
        type: String(data['type'] ?? ''),
        endpointUrl: (data['endpoint_url'] as string | undefined) ?? null,
        apiType: (data['api_type'] as string | undefined) ?? null,
        metadata: (data['metadata'] as Record<string, unknown> | undefined) ?? {},
      };
    }
  }

  async getDiscovery(discoveryId: string): Promise<Record<string, unknown>> { return this._t.get(`skanyr/discover/${discoveryId}`); }
  async getDiscoveryEvents(discoveryId: string): Promise<Record<string, unknown>> { return this._t.get(`skanyr/discover/${discoveryId}/events`); }

  async analyzeBundle(url: string): Promise<Record<string, unknown>> { return this._t.post('skanyr/analyze-bundle', { url }); }
  async discoverPageLive(url: string): Promise<Record<string, unknown>> { return this._t.post('skanyr/discover-page/live', { url }); }
  async detectedApis(pageUrl: string): Promise<Record<string, unknown>> { return this._t.get('skanyr/detected-apis', { page_url: pageUrl }); }
  async hierarchy(url: string): Promise<Record<string, unknown>> { return this._t.post('skanyr/hierarchy', { url }); }
  async expandNode(nodeId: string): Promise<Record<string, unknown>> { return this._t.post('skanyr/expand-node', { node_id: nodeId }); }
  async readerView(url: string): Promise<Record<string, unknown>> { return this._t.post('skanyr/reader-view', { url }); }

  async retry(discoveryId: string, overrides?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post('skanyr/retry', { discovery_id: discoveryId, ...overrides });
  }

  async health(): Promise<Record<string, unknown>> { return this._t.get('skanyr/health'); }

  async listSessions(): Promise<Record<string, unknown>> { return this._t.get('skanyr/sessions'); }
  async saveSession(config: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.post('skanyr/sessions', config); }
  async getSession(sessionId: string): Promise<Record<string, unknown>> { return this._t.get(`skanyr/sessions/${sessionId}`); }
  async deleteSession(sessionId: string): Promise<void> { await this._t.delete(`skanyr/sessions/${sessionId}`); }
  async endSession(sessionId: string): Promise<Record<string, unknown>> { return this._t.post(`skanyr/sessions/${sessionId}/end`, {}); }
  async updateSessionJob(sessionId: string, jobId: string): Promise<Record<string, unknown>> { return this._t.patch(`skanyr/sessions/${sessionId}/job`, { job_id: jobId }); }

  async getApiMap(artifactId: string): Promise<Record<string, unknown>> {
    return this._t.get(`skanyr/api-map/${artifactId}`);
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return this._t.get(`skanyr/jobs/${jobId}`);
  }
}
