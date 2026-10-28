/**
 * KLOAKD SDK — Shared HTTP transport layer (TypeScript).
 *
 * Uses the native `fetch` API (Node 18+, all modern browsers).
 *
 * Retry policy (up to `maxRetries` retries, default 3; waits capped at 60 s):
 *   - 429 `rate_limited`, any method: after `Retry-After` (or the body's
 *     `retry_after`, or until `reset_at`). Not retried when it is the
 *     playground quota (`retry_after` 0 and no `reset_at`).
 *   - 503 `billing_unavailable`, any method: after `Retry-After` (no work was done).
 *   - Other 5xx and network errors: GET, HEAD and DELETE only, with
 *     exponential backoff (1 s * 2^attempt). POST, PUT and PATCH are never
 *     retried on these, since the API may already have done the work.
 *   - Never retried: 4xx other than the above, and 429 `gb_exhausted`.
 */

import { BillingUnavailableError, KloakdError, RateLimitError, raiseForStatus } from './errors.js';

export const SDK_VERSION = '0.5.0';
export const USER_AGENT = `kloakd-sdk-js/${SDK_VERSION}`;
const IDEMPOTENT = new Set(['GET', 'HEAD', 'DELETE']);
const MAX_WAIT_MS = 60_000;

function sdkHeader(): string {
  return `typescript/${SDK_VERSION}`;
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), MAX_WAIT_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long to wait before retrying `err` on `method`, or null when it is not retried. */
function retryDelayMs(err: unknown, method: string, attempt: number): number | null {
  if (err instanceof RateLimitError) {
    if (err.quotaExhausted) return null;
    if (err.retryAfter > 0) return Math.min(err.retryAfter * 1000, MAX_WAIT_MS);
    const reset = err.resetAt ? Date.parse(err.resetAt) : NaN;
    if (Number.isFinite(reset)) return Math.min(Math.max(reset - Date.now(), 0), MAX_WAIT_MS);
    return backoffMs(attempt);
  }
  if (err instanceof BillingUnavailableError) {
    return Math.min(Math.max(err.retryAfter, 0) * 1000, MAX_WAIT_MS);
  }
  if (!IDEMPOTENT.has(method)) return null;
  if (err instanceof KloakdError) return err.statusCode >= 500 ? backoffMs(attempt) : null;
  // A network error or timeout from fetch itself.
  return backoffMs(attempt);
}

/** Read a response body: JSON when it is JSON, otherwise its text (for error messages). */
async function readBody(resp: Response): Promise<{ json: Record<string, unknown> | null; text: string }> {
  const isJson = resp.headers.get('content-type')?.includes('application/json') ?? false;
  let text = '';
  if (typeof resp.text === 'function') {
    try { text = await resp.text(); } catch { text = ''; }
    if (isJson && text) {
      try { return { json: JSON.parse(text) as Record<string, unknown>, text }; } catch { /* not JSON after all */ }
    }
    return { json: null, text };
  }
  // Minimal Response-likes (tests) that only implement json().
  if (isJson && typeof resp.json === 'function') {
    try { return { json: (await resp.json()) as Record<string, unknown>, text: '' }; } catch { /* fall through */ }
  }
  return { json: null, text };
}

/** Throw the typed error for a non-2xx response; a body that is not JSON becomes the message. */
async function raiseForResponse(resp: Response): Promise<void> {
  const { json, text } = await readBody(resp);
  const body = json ?? (text.trim() ? { detail: text.trim().slice(0, 2000) } : {});
  raiseForStatus(resp.status, body, resp.headers);
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
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    };
  }

  orgPrefix(): string {
    return `/api/v1/organizations/${this._organizationId}`;
  }

  url(path: string): string {
    return `${this._baseUrl}${this.orgPrefix()}/${path.replace(/^\//, '')}`;
  }

  /**
   * The URL of a path the API gave as absolute (`/api/v1/...`, such as a
   * 202's `poll_url`): joined to the configured base URL, as every other
   * request is. A full http(s) URL is used as it is.
   */
  absoluteUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    return `${this._baseUrl}/${path.replace(/^\//, '')}`;
  }

  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): Promise<T> {
    return (await this.requestWithStatus<T>(method, path, body, params)).body;
  }

  /** As request(), with the HTTP status of the answer (to tell a 202 hand-off from a 200). */
  async requestWithStatus<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): Promise<{ status: number; body: T }> {
    return this.send<T>(method, this.url(path), body, params);
  }

  /** GET a path the API gave as absolute (see absoluteUrl). */
  async getAbsolute<T = Record<string, unknown>>(path: string): Promise<T> {
    return (await this.send<T>('GET', this.absoluteUrl(path))).body;
  }

  private async send<T>(
    method: string,
    url: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): Promise<{ status: number; body: T }> {
    const resp = await this.fetchWithRetry(method, url, body, params);
    const { json } = await readBody(resp);
    return { status: resp.status, body: (json ?? {}) as T };
  }

  /** Send a request and return its body as bytes (for binary answers such as a zip). */
  async requestBytes(method: string, path: string, body?: Record<string, unknown>): Promise<Uint8Array> {
    const resp = await this.fetchWithRetry(method, this.url(path), body);
    return new Uint8Array(await resp.arrayBuffer());
  }

  /** Send with the retry policy above; returns the first 2xx response. */
  private async fetchWithRetry(
    method: string,
    url: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
  ): Promise<Response> {
    let fullUrl = url;
    if (params && Object.keys(params).length > 0) {
      fullUrl += '?' + new URLSearchParams(params).toString();
    }
    const upper = method.toUpperCase();

    for (let attempt = 0; ; attempt++) {
      const init: RequestInit = {
        method: upper,
        headers: this.authHeaders(),
        // Each attempt gets its own timeout (seconds, `timeout` option).
        signal: AbortSignal.timeout(this._timeout * 1000),
      };
      if (body !== undefined) init.body = JSON.stringify(body);

      try {
        const resp = await this._fetch(fullUrl, init);
        if (resp.status >= 400) await raiseForResponse(resp);
        return resp;
      } catch (err) {
        const delay = attempt < this._maxRetries ? retryDelayMs(err, upper, attempt) : null;
        if (delay === null) throw err;
        await sleep(delay);
      }
    }
  }

  async get<T = Record<string, unknown>>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /** POST and return the HTTP status with the body. */
  async postWithStatus<T = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; body: T }> {
    return this.requestWithStatus<T>('POST', path, body);
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

    if (resp.status >= 400) await raiseForResponse(resp);
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
