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

/** 402: a paid plan whose last payment failed (`payment_required`). */
export class PaymentRequiredError extends KloakdError {
  readonly upgradeUrl: string;

  constructor(message: string, upgradeUrl = 'https://app.kloakd.dev/settings/billing') {
    super(message, 402);
    this.name = 'PaymentRequiredError';
    this.upgradeUrl = upgradeUrl;
  }
}

/** 429 `gb_exhausted`: the plan's GB and this period's top-ups are used up. Not retried. */
export class QuotaExceededError extends KloakdError {
  readonly tier: string;
  readonly upgradeUrl: string;

  constructor(message: string, tier = '', upgradeUrl = 'https://app.kloakd.dev/settings/billing') {
    super(message, 429);
    this.name = 'QuotaExceededError';
    this.tier = tier;
    this.upgradeUrl = upgradeUrl;
  }
}

/** 503 `billing_unavailable`: usage could not be checked, so nothing was started. Retry after `retryAfter` seconds. */
export class BillingUnavailableError extends KloakdError {
  readonly retryAfter: number;

  constructor(message: string, retryAfter = 30) {
    super(message, 503);
    this.name = 'BillingUnavailableError';
    this.retryAfter = retryAfter;
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

/** A job the API handed off (202) or started (`fetchAsync`) ended as failed. */
export class JobFailedError extends KloakdError {
  readonly jobId: string;

  constructor(message: string, jobId: string) {
    super(message, 0);
    this.name = 'JobFailedError';
    this.jobId = jobId;
  }
}

/** A job was still running when the SDK's wait ran out; poll it later with its id. */
export class JobTimeoutError extends KloakdError {
  readonly jobId: string;

  constructor(message: string, jobId: string) {
    super(message, 0);
    this.name = 'JobTimeoutError';
    this.jobId = jobId;
  }
}

/**
 * Map an HTTP status code + body to the correct error subclass.
 * Used by the transport layer after every non-2xx response.
 *
 * The API puts its error in `detail`, as a string or as an object
 * `{error, message, ...}`; both are read.
 */
export function raiseForStatus(
  statusCode: number,
  body: Record<string, unknown>,
  headers?: { get(name: string): string | null },
): void {
  if (statusCode < 400) return;

  const rawDetail = body['detail'];
  const detailObj =
    rawDetail !== null && typeof rawDetail === 'object' && !Array.isArray(rawDetail)
      ? (rawDetail as Record<string, unknown>)
      : body;
  const code = (detailObj['error'] as string | undefined) ?? '';
  const detail =
    (typeof rawDetail === 'string' ? rawDetail : undefined) ??
    (detailObj['message'] as string | undefined) ??
    (body['message'] as string | undefined) ??
    (code || `HTTP ${statusCode}`);
  const retryHeader = Number(headers?.get('retry-after') ?? NaN);

  if (statusCode === 401) {
    throw new AuthenticationError(`Invalid or expired API key: ${detail}`);
  }
  if (statusCode === 402) {
    throw new PaymentRequiredError(
      detail,
      (detailObj['upgrade_url'] as string | undefined) ?? 'https://app.kloakd.dev/settings/billing',
    );
  }
  if (statusCode === 403) {
    throw new NotEntitledError(
      `Not entitled to this module: ${detail}`,
      (detailObj['module'] as string | undefined) ?? 'unknown',
      (detailObj['upgrade_url'] as string | undefined) ?? 'https://app.kloakd.dev/billing',
    );
  }
  if (statusCode === 429) {
    if (code === 'gb_exhausted') {
      throw new QuotaExceededError(
        detail,
        (detailObj['tier'] as string | undefined) ?? '',
        (detailObj['upgrade_url'] as string | undefined) ?? 'https://app.kloakd.dev/settings/billing',
      );
    }
    throw new RateLimitError(
      `Rate limit exceeded: ${detail}`,
      Number.isFinite(retryHeader) ? retryHeader : Number((detailObj['retry_after'] as number | undefined) ?? 60),
      (detailObj['reset_at'] as string | undefined) ?? '',
    );
  }
  if (statusCode === 502) {
    throw new UpstreamError(`Upstream fetch failed: ${detail}`);
  }
  if (statusCode === 503 && code === 'billing_unavailable') {
    throw new BillingUnavailableError(detail, Number.isFinite(retryHeader) ? retryHeader : 30);
  }
  throw new ApiError(`KLOAKD API error ${statusCode}: ${detail}`, statusCode);
}
