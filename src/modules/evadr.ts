import type { HttpTransport } from '../_http.js';
import { followJob, postFollowingHandoff } from '../_handoff.js';
import type { HandoffOptions } from '../_handoff.js';
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
    artifactId: (raw['artifact'] as Record<string, unknown> | undefined)?.['artifact_id'] as string | undefined ?? (raw['artifact_id'] as string | undefined) ?? null,
    error: (raw['error'] as string | undefined) ?? null,
  };
  return { ...result, get ok() { return result.success && result.error === null; } };
}

export interface FetchOptions extends HandoffOptions {
  forceBrowser?: boolean;
  useProxy?: boolean;
  sessionArtifactId?: string;
}

export interface FetchAsyncOptions {
  forceBrowser?: boolean;
  useProxy?: boolean;
  sessionArtifactId?: string;
  webhookUrl?: string;
}

export class EvadrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /**
   * Fetch a page. The API answers within about 85 s; a fetch still running
   * then is handed off as a job (202), which this follows to its result
   * (polling the 202's `poll_url`; see HandoffOptions).
   */
  async fetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const body: Record<string, unknown> = { url };
    if (opts.forceBrowser) body['force_browser'] = true;
    if (opts.useProxy) body['use_proxy'] = true;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    return parseFetch(await postFollowingHandoff(this._t, 'evadr/fetch', body, opts), url);
  }

  /** Start a fetch as a job; returns the job id (poll with getJob or waitForJob). */
  async fetchAsync(url: string, opts: FetchAsyncOptions = {}): Promise<string> {
    const body: Record<string, unknown> = { url };
    if (opts.forceBrowser) body['force_browser'] = true;
    if (opts.useProxy) body['use_proxy'] = true;
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    if (opts.webhookUrl) body['webhook_url'] = opts.webhookUrl;
    const raw = await this._t.post('evadr/fetch/async', body);
    return String(raw['job_id']);
  }

  /** Poll a fetch job until it completes (its result) or fails (JobFailedError). */
  async waitForJob(
    jobId: string,
    opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
  ): Promise<Record<string, unknown>> {
    return followJob(jobId, () => this.getJob(jobId), {
      pollIntervalMs: opts.pollIntervalMs,
      pollTimeoutMs: opts.timeoutMs,
    });
  }

  /** Start a fetch as a job and stream its progress events. */
  async *fetchStream(url: string, opts: FetchAsyncOptions = {}): AsyncIterable<FetchEvent> {
    const jobId = await this.fetchAsync(url, opts);
    for await (const data of this.jobEvents(jobId)) {
      yield {
        type: String(data['event_type'] ?? data['type'] ?? ''),
        tier: data['tier'] != null ? Number(data['tier']) : null,
        vendor: (data['vendor'] as string | undefined) ?? null,
        metadata: (data['metadata'] as Record<string, unknown> | undefined) ?? data,
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

  /** Lightweight HTTP fetch and anti-bot analysis of a URL. */
  async scan(url: string): Promise<Record<string, unknown>> {
    return this._t.post('evadr/scan', { url });
  }

  /** The canonical site profile of a URL. */
  async profile(url: string): Promise<Record<string, unknown>> {
    return this._t.post('evadr/profile', { url });
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return this._t.get(`evadr/jobs/${jobId}`);
  }

  /** A fetch job's progress events (Server-Sent Events). */
  jobEvents(jobId: string): AsyncIterable<Record<string, unknown>> {
    return this._t.streamGet(`evadr/jobs/${jobId}/events`);
  }

  async listVendors(): Promise<Record<string, unknown>[]> {
    return this._t.get('evadr/vendors');
  }

  async listProfiles(): Promise<Record<string, unknown>[]> {
    return this._t.get('evadr/profiles');
  }

  async listProxies(): Promise<Record<string, unknown>[]> {
    return this._t.get('evadr/proxies');
  }

  async storeProxy(name: string, proxyUrl: string): Promise<void> {
    await this._t.post('evadr/proxies', { name, proxy_url: proxyUrl });
  }

  async deleteProxy(name: string): Promise<void> {
    await this._t.delete(`evadr/proxies/${encodeURIComponent(name)}`);
  }
}
