/**
 * KLOAKD SDK — Error hierarchy.
 *
 * All errors extend KloakdError, which extends the native Error class.
 * Every error carries statusCode and message.
 *
 * @example
 * ```typescript
 * import { RateLimitError, KloakdError } from 'kloakd-sdk';
 *
 * try {
 *   const result = await client.evadr.fetch('https://example.com');
 * } catch (e) {
 *   if (e instanceof RateLimitError) {
 *     await sleep(e.retryAfter * 1000);
 *   } else if (e instanceof KloakdError) {
 *     console.error(e.statusCode, e.message);
 *   }
 * }
 * ```
 */

export class KloakdError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'KloakdError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends KloakdError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class NotEntitledError extends KloakdError {
  readonly module: string;
  readonly upgradeUrl: string;

  constructor(message: string, module: string, upgradeUrl = 'https://app.kloakd.dev/billing') {
    super(message, 403);
    this.name = 'NotEntitledError';
    this.module = module;
    this.upgradeUrl = upgradeUrl;
  }
}

export class RateLimitError extends KloakdError {
  readonly retryAfter: number;
  readonly resetAt: string;

  constructor(message: string, retryAfter: number, resetAt = '') {
    super(message, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.resetAt = resetAt;
  }
}

export class UpstreamError extends KloakdError {
  constructor(message: string) {
    super(message, 502);
    this.name = 'UpstreamError';
  }
}

export class ApiError extends KloakdError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = 'ApiError';
  }
}

/**
 * Map an HTTP status code + body to the correct error subclass.
 * Used by the transport layer after every non-2xx response.
 */
export function raiseForStatus(statusCode: number, body: Record<string, unknown>): void {
  if (statusCode < 400) return;

  const detail =
    (body['detail'] as string | undefined) ??
    (body['message'] as string | undefined) ??
    `HTTP ${statusCode}`;

  if (statusCode === 401) {
    throw new AuthenticationError(`Invalid or expired API key: ${detail}`);
  }
  if (statusCode === 403) {
    throw new NotEntitledError(
      `Not entitled to this module: ${detail}`,
      (body['module'] as string | undefined) ?? 'unknown',
      (body['upgrade_url'] as string | undefined) ?? 'https://app.kloakd.dev/billing',
    );
  }
  if (statusCode === 429) {
    throw new RateLimitError(
      `Rate limit exceeded: ${detail}`,
      Number((body['retry_after'] as number | undefined) ?? 60),
      (body['reset_at'] as string | undefined) ?? '',
    );
  }
  if (statusCode === 502) {
    throw new UpstreamError(`Upstream fetch failed: ${detail}`);
  }
  throw new ApiError(`KLOAKD API error ${statusCode}: ${detail}`, statusCode);
}
