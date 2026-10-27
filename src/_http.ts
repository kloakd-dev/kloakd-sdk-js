/**
 * KLOAKD SDK — Shared HTTP transport layer (TypeScript).
 *
 * Uses the native `fetch` API (Node 18+, all modern browsers).
 * Retry policy:
 *   - Retryable: 429 (rate_limited), 500, 502, 503, 504
 *   - Non-retryable: 400, 401, 402, 403, 404, 429 gb_exhausted
 *   - 503 billing_unavailable respects Retry-After
 *   - Strategy: exponential backoff (1s * 2^attempt), cap 60s
 *   - 429 respects Retry-After header
 *   - Max attempts: configurable, default 3
 */

import { KloakdError, QuotaExceededError, raiseForStatus } from './errors.js';

export const SDK_VERSION = '0.3.0';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function sdkHeader(): string {
  return `typescript/${SDK_VERSION}`;
}

function backoff(attempt: number, retryAfter?: number): number {
  if (retryAfter != null && retryAfter >= 0) return Math.min(retryAfter * 1000, 60_000);
  return Math.min(1000 * Math.pow(2, attempt), 60_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TransportOptions {
  apiKey: string;
  organizationId: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  /** Injected fetch implementation — used in tests to mock responses. */
  fetchImpl?: typeof fetch;
}

export class HttpTransport {
  readonly _apiKey: string;
  readonly _organizationId: string;
  readonly _baseUrl: string;
  readonly _timeout: number;
  readonly _maxRetries: number;
  private readonly _fetch: typeof fetch;

  constructor(opts: TransportOptions) {
    this._apiKey = opts.apiKey;
    this._organizationId = opts.organizationId;
    this._baseUrl = opts.baseUrl.replace(/\/$/, '');
    this._timeout = opts.timeout;
    this._maxRetries = opts.maxRetries;
    this._fetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this._apiKey}`,
      'X-Kloakd-Organization': this._organizationId,
      'X-Kloakd-SDK': sdkHeader(),
      'Content-Type': 'application/json',
    };
  }

  orgPrefix(): string {
    return `/api/v1/organizations/${this._organizationId}`;
  }

  url(path: string): string {
    return `${this._baseUrl}${this.orgPrefix()}/${path.replace(/^\//, '')}`;
  }

  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): Promise<T> {
    let fullUrl = this.url(path);
    if (params && Object.keys(params).length > 0) {
      fullUrl += '?' + new URLSearchParams(params).toString();
    }

    const headers = this.authHeaders();
    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this._timeout * 1000),
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    let lastError: KloakdError | undefined;

    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      const resp = await this._fetch(fullUrl, init);
      const json = resp.headers.get('content-type')?.includes('application/json')
        ? ((await resp.json()) as Record<string, unknown>)
        : {};

      try {
        raiseForStatus(resp.status, json, resp.headers);
        return json as T;
      } catch (err) {
        if (!(err instanceof KloakdError)) throw err;
        if (!RETRYABLE.has(err.statusCode) || err instanceof QuotaExceededError) throw err;

        lastError = err;
        if (attempt < this._maxRetries) {
          const header = resp.headers.get('retry-after');
          const retryAfter =
            err.statusCode === 429 || err.statusCode === 503
              ? Number(header ?? (err as { retryAfter?: number }).retryAfter ?? (err.statusCode === 429 ? 60 : undefined))
              : undefined;
          await sleep(backoff(attempt, Number.isFinite(retryAfter) ? retryAfter : undefined));
        }
      }
    }

    throw lastError!;
  }

  async get<T = Record<string, unknown>>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async patch<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  /**
   * Open an SSE stream and return an AsyncIterable over raw `data:` payloads.
   * Caller is responsible for parsing each chunk.
   */
  /** POST an SSE stream; yields each `data:` payload. */
  async *stream(path: string, body: Record<string, unknown>): AsyncIterable<Record<string, unknown>> {
    for await (const { data } of this._sse('POST', path, body)) yield data;
  }

  /** GET an SSE stream (the API's job and crawl event routes). */
  async *streamGet(path: string, params?: Record<string, string>): AsyncIterable<Record<string, unknown>> {
    for await (const { data } of this._sse('GET', path, undefined, params)) yield data;
  }

  /**
   * POST an SSE stream that also surfaces the `event:` field alongside `data:`.
   * Used by Parlyr.chatStream().
   */
  async *streamWithEvents(
    path: string,
    body: Record<string, unknown>,
  ): AsyncIterable<{ event: string; data: Record<string, unknown> }> {
    yield* this._sse('POST', path, body);
  }

  private async *_sse(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): AsyncIterable<{ event: string; data: Record<string, unknown> }> {
    let fullUrl = this.url(path);
    if (params && Object.keys(params).length > 0) {
      fullUrl += '?' + new URLSearchParams(params).toString();
    }
    const init: RequestInit = { method, headers: { ...this.authHeaders(), Accept: 'text/event-stream' } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const resp = await this._fetch(fullUrl, init);

    if (resp.status >= 400) {
      const json = resp.headers.get('content-type')?.includes('application/json')
        ? ((await resp.json()) as Record<string, unknown>)
        : {};
      raiseForStatus(resp.status, json, resp.headers);
    }
    if (!resp.body) return;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr) continue;
            try {
              yield { event: currentEvent, data: JSON.parse(dataStr) as Record<string, unknown> };
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
