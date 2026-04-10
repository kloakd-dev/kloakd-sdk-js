/**
 * KLOAKD SDK — Shared HTTP transport layer (TypeScript).
 *
 * Uses the native `fetch` API (Node 18+, all modern browsers).
 * Retry policy:
 *   - Retryable: 429, 500, 502, 503, 504
 *   - Non-retryable: 400, 401, 403, 404
 *   - Strategy: exponential backoff (1s * 2^attempt), cap 60s
 *   - 429 respects Retry-After header
 *   - Max attempts: configurable, default 3
 */

import { KloakdError, raiseForStatus } from './errors.js';

const SDK_VERSION = '0.1.0';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function sdkHeader(): string {
  return `typescript/${SDK_VERSION}`;
}

function backoff(attempt: number, retryAfter?: number): number {
  if (retryAfter != null && retryAfter > 0) return retryAfter * 1000;
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
        raiseForStatus(resp.status, json);
        return json as T;
      } catch (err) {
        if (!(err instanceof KloakdError)) throw err;
        if (!RETRYABLE.has(err.statusCode)) throw err;

        lastError = err;
        if (attempt < this._maxRetries) {
          const retryAfter =
            err.statusCode === 429
              ? Number(resp.headers.get('retry-after') ?? (json['retry_after'] as number | undefined) ?? 60)
              : undefined;
          await sleep(backoff(attempt, retryAfter));
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

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  /**
   * Open an SSE stream and return an AsyncIterable over raw `data:` payloads.
   * Caller is responsible for parsing each chunk.
   */
  async *stream(path: string, body: Record<string, unknown>): AsyncIterable<Record<string, unknown>> {
    const headers = { ...this.authHeaders(), Accept: 'text/event-stream' };
    const resp = await this._fetch(this.url(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(0), // no timeout on streams
    });

    raiseForStatus(resp.status, {});

    if (!resp.body) return;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (!dataStr) continue;
          try {
            yield JSON.parse(dataStr) as Record<string, unknown>;
          } catch {
            // skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * SSE stream that also surfaces `event:` field alongside `data:`.
   * Used by Parlyr.chatStream().
   */
  async *streamWithEvents(
    path: string,
    body: Record<string, unknown>,
  ): AsyncIterable<{ event: string; data: Record<string, unknown> }> {
    const headers = { ...this.authHeaders(), Accept: 'text/event-stream' };
    const resp = await this._fetch(this.url(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(0),
    });

    raiseForStatus(resp.status, {});

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
