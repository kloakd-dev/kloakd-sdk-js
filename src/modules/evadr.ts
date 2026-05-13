import type { HttpTransport } from '../_http.js';
import type { AnalyzeResult, FetchEvent, FetchResult } from '../models.js';

function parseFetch(raw: Record<string, unknown>, url: string): FetchResult {
  const result = {
    success: Boolean(raw['success']),
    url: (raw['url'] as string | undefined) ?? url,
    statusCode: Number(raw['status_code'] ?? 0),
    tierUsed: Number(raw['tier_used'] ?? 1),
    html: (raw['html'] as string | undefined) ?? null,
    vendorDetected: (raw['vendor_detected'] as string | undefined) ?? null,
    antiBotBypassed: Boolean(raw['anti_bot_bypassed']),
    artifactId: (raw['artifact_id'] as string | undefined) ?? null,
    error: (raw['error'] as string | undefined) ?? null,
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}

export interface FetchOptions {
  forceBrowser?: boolean;
  useProxy?: boolean;
  sessionArtifactId?: string;
}

export interface FetchAsyncOptions extends FetchOptions {
  webhookUrl?: string;
}

export class EvadrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  async fetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const body: Record<string, unknown> = { url };
    if (opts.forceBrowser) body['force_browser'] = true;
    if (opts.useProxy) body['use_proxy'] = true;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await this._t.post('evadr/fetch', body);
    return parseFetch(raw, url);
  }

  async fetchAsync(url: string, opts: FetchAsyncOptions = {}): Promise<string> {
    const body: Record<string, unknown> = { url, async: true };
    if (opts.forceBrowser) body['force_browser'] = true;
    if (opts.useProxy) body['use_proxy'] = true;
    if (opts.webhookUrl) body['webhook_url'] = opts.webhookUrl;
    const raw = await this._t.post('evadr/fetch', body);
    return String(raw['job_id']);
  }

  async *fetchStream(url: string, opts: { forceBrowser?: boolean } = {}): AsyncIterable<FetchEvent> {
    const body: Record<string, unknown> = { url };
    if (opts.forceBrowser) body['force_browser'] = true;
    for await (const data of this._t.stream('evadr/fetch/stream', body)) {
      yield {
        type: String(data['type'] ?? ''),
        tier: data['tier'] != null ? Number(data['tier']) : null,
        vendor: (data['vendor'] as string | undefined) ?? null,
        metadata: (data['metadata'] as Record<string, unknown> | undefined) ?? {},
      };
    }
  }

  async analyze(
    url: string,
    opts: { statusCode?: number; headers?: Record<string, string>; bodySnippet?: string } = {},
  ): Promise<AnalyzeResult> {
    const raw = await this._t.post('evadr/analyze', {
      url,
      status_code: opts.statusCode ?? 200,
      headers: opts.headers ?? {},
      body_snippet: opts.bodySnippet ?? null,
    });
    return {
      blocked: Boolean(raw['blocked']),
      vendor: (raw['vendor'] as string | undefined) ?? null,
      confidence: Number(raw['confidence'] ?? 0),
      recommendedActions: (raw['recommended_actions'] as string[] | undefined) ?? [],
    };
  }

  async scan(url: string, opts: { statusCode?: number; headers?: Record<string, string>; bodySnippet?: string } = {}): Promise<Record<string, unknown>> {
    return this._t.post('evadr/scan', { url, status_code: opts.statusCode ?? 200, headers: opts.headers ?? {}, body_snippet: opts.bodySnippet ?? null });
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return this._t.get(`evadr/jobs/${jobId}`);
  }

  async getJobEvents(jobId: string): Promise<Record<string, unknown>> {
    return this._t.get(`evadr/jobs/${jobId}/events`);
  }

  async listVendors(): Promise<Record<string, unknown>> {
    return this._t.get('evadr/vendors');
  }

  async listProfiles(): Promise<Record<string, unknown>> {
    return this._t.get('evadr/profiles');
  }

  async listProxies(): Promise<Record<string, unknown>> {
    return this._t.get('evadr/proxies');
  }

  async storeProxy(name: string, proxyUrl: string): Promise<void> {
    await this._t.post('evadr/proxies', { name, proxy_url: proxyUrl });
  }

  async deleteProxy(name: string): Promise<void> {
    await this._t.delete(`evadr/proxies/${name}`);
  }
}
