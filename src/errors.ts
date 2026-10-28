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
  /** The API's error code (`detail.error`), when it gave one; '' otherwise. */
  readonly code: string;

  constructor(message: string, statusCode: number, code = '') {
    super(message);
    this.name = 'KloakdError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends KloakdError {
  constructor(message: string, code = '') {
    super(message, 401, code);
    this.name = 'AuthenticationError';
  }
}

/** 403 that is not about the plan: the key or user may not do this. */
export class ForbiddenError extends KloakdError {
  constructor(message: string, code = '') {
    super(message, 403, code);
    this.name = 'ForbiddenError';
  }
}

/**
 * 403 `not_entitled` (the plan does not include the module) or
 * `tier_access_denied` (the tier does not include the feature).
 */
export class NotEntitledError extends ForbiddenError {
  readonly module: string;
  readonly upgradeUrl: string;
  /** `tier_access_denied`: the feature the tier lacks; '' otherwise. */
  readonly feature: string;
  /** `tier_access_denied`: the organisation's tier and the tier the feature needs; '' otherwise. */
  readonly currentTier: string;
  readonly requiredTier: string;

  constructor(
    message: string,
    module: string,
    upgradeUrl = 'https://app.kloakd.dev/billing',
    opts: { code?: string; feature?: string; currentTier?: string; requiredTier?: string } = {},
  ) {
    super(message, opts.code ?? 'not_entitled');
    this.name = 'NotEntitledError';
    this.module = module;
    this.upgradeUrl = upgradeUrl;
    this.feature = opts.feature ?? '';
    this.currentTier = opts.currentTier ?? '';
    this.requiredTier = opts.requiredTier ?? '';
  }
}

/**
 * 429 `rate_limited`. Retried by the SDK after `retryAfter` seconds, except
 * the playground quota (`quotaExhausted`: the API gives `retry_after` 0 and no
 * `reset_at`, so waiting does not help), which carries `quotaUsed` and `quotaLimit`.
 */
export class RateLimitError extends KloakdError {
  readonly retryAfter: number;
  readonly resetAt: string;
  readonly quotaUsed: number | null;
  readonly quotaLimit: number | null;
  readonly upgradeUrl: string | null;

  constructor(
    message: string,
    retryAfter: number,
    resetAt = '',
    opts: { quotaUsed?: number | null; quotaLimit?: number | null; upgradeUrl?: string | null } = {},
  ) {
    super(message, 429, 'rate_limited');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.resetAt = resetAt;
    this.quotaUsed = opts.quotaUsed ?? null;
    this.quotaLimit = opts.quotaLimit ?? null;
    this.upgradeUrl = opts.upgradeUrl ?? null;
  }

  /** The playground quota is used up: retrying will not succeed. */
  get quotaExhausted(): boolean {
    return this.retryAfter === 0 && !this.resetAt;
  }
}

/** 409 `concurrent_limit`: too many crawls or jobs are running; start again when one finishes. */
export class ConcurrencyLimitError extends KloakdError {
  readonly concurrentLimit: number | null;
  readonly activeCrawls: number | null;
  readonly tier: string;

  constructor(message: string, opts: { concurrentLimit?: number | null; activeCrawls?: number | null; tier?: string } = {}) {
    super(message, 409, 'concurrent_limit');
    this.name = 'ConcurrencyLimitError';
    this.concurrentLimit = opts.concurrentLimit ?? null;
    this.activeCrawls = opts.activeCrawls ?? null;
    this.tier = opts.tier ?? '';
  }
}

/** 402: a paid plan whose last payment failed (`payment_required`). */
export class PaymentRequiredError extends KloakdError {
  readonly upgradeUrl: string;

  constructor(message: string, upgradeUrl = 'https://app.kloakd.dev/settings/billing') {
    super(message, 402, 'payment_required');
    this.name = 'PaymentRequiredError';
    this.upgradeUrl = upgradeUrl;
  }
}

/** 429 `gb_exhausted`: the plan's GB and this period's top-ups are used up. Not retried. */
export class QuotaExceededError extends KloakdError {
  readonly tier: string;
  readonly upgradeUrl: string;

  constructor(message: string, tier = '', upgradeUrl = 'https://app.kloakd.dev/settings/billing') {
    super(message, 429, 'gb_exhausted');
    this.name = 'QuotaExceededError';
    this.tier = tier;
    this.upgradeUrl = upgradeUrl;
  }
}

/** 503 `billing_unavailable`: usage could not be checked, so nothing was started. Retried after `retryAfter` seconds. */
export class BillingUnavailableError extends KloakdError {
  readonly retryAfter: number;

  constructor(message: string, retryAfter = 30) {
    super(message, 503, 'billing_unavailable');
    this.name = 'BillingUnavailableError';
    this.retryAfter = retryAfter;
  }
}

export class UpstreamError extends KloakdError {
  constructor(message: string, code = '') {
    super(message, 502, code);
    this.name = 'UpstreamError';
  }
}

export class ApiError extends KloakdError {
  constructor(message: string, statusCode: number, code = '') {
    super(message, statusCode, code);
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

/**
 * A job was still running when the SDK's wait ran out. Resume with its id:
 * `client.waitForHandoff(jobId)` for a hand-off, `evadr.waitForJob(jobId)`
 * for a fetch job, `webgrph.getCrawlStatus(jobId)` for a crawl.
 */
export class JobTimeoutError extends KloakdError {
  readonly jobId: string;

  constructor(message: string, jobId: string) {
    super(message, 0);
    this.name = 'JobTimeoutError';
    this.jobId = jobId;
  }
}

/** FastAPI's 422 body: `detail` is a list of `{loc, msg, type}`. */
function validationMessage(items: unknown[]): string {
  return items
    .map((item) => {
      if (item === null || typeof item !== 'object') return String(item);
      const it = item as Record<string, unknown>;
      const loc = Array.isArray(it['loc']) ? (it['loc'] as unknown[]).join('.') : '';
      const msg = String(it['msg'] ?? it['message'] ?? JSON.stringify(it));
      return loc ? `${loc}: ${msg}` : msg;
    })
    .join('; ');
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map an HTTP status code + body to the correct error subclass.
 * Used by the transport layer after every non-2xx response.
 *
 * The API puts its error in `detail`: a string, an object
 * `{error, message, ...}`, or (422) a list of validation errors; all are
 * read. A body that was not JSON is passed as `{ detail: <its text> }`.
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
  const code = typeof detailObj['error'] === 'string' ? (detailObj['error'] as string) : '';
  const detail =
    (typeof rawDetail === 'string' && rawDetail ? rawDetail : undefined) ??
    (Array.isArray(rawDetail) && rawDetail.length > 0 ? validationMessage(rawDetail) : undefined) ??
    (typeof detailObj['message'] === 'string' ? (detailObj['message'] as string) : undefined) ??
    (typeof body['message'] === 'string' ? (body['message'] as string) : undefined) ??
    (code || `HTTP ${statusCode}`);
  const str = (key: string): string | undefined =>
    typeof detailObj[key] === 'string' ? (detailObj[key] as string) : undefined;
  const retryHeader = num(headers?.get('retry-after'));

  if (statusCode === 401) {
    throw new AuthenticationError(`Invalid or expired API key: ${detail}`, code);
  }
  if (statusCode === 402) {
    throw new PaymentRequiredError(detail, str('upgrade_url') ?? 'https://app.kloakd.dev/settings/billing');
  }
  if (statusCode === 403) {
    if (code === 'not_entitled') {
      throw new NotEntitledError(
        `Not entitled to this module: ${detail}`,
        str('module') ?? 'unknown',
        str('upgrade_url') ?? 'https://app.kloakd.dev/billing',
      );
    }
    if (code === 'tier_access_denied') {
      throw new NotEntitledError(detail, str('module') ?? '', str('upgrade_url') ?? 'https://app.kloakd.dev/billing', {
        code,
        feature: str('feature') ?? '',
        currentTier: str('current_tier') ?? '',
        requiredTier: str('required_tier') ?? '',
      });
    }
    throw new ForbiddenError(`Forbidden: ${detail}`, code);
  }
  if (statusCode === 409 && code === 'concurrent_limit') {
    throw new ConcurrencyLimitError(detail, {
      concurrentLimit: num(detailObj['concurrent_limit']),
      activeCrawls: num(detailObj['active_crawls']),
      tier: str('tier') ?? '',
    });
  }
  if (statusCode === 429) {
    if (code === 'gb_exhausted') {
      throw new QuotaExceededError(detail, str('tier') ?? '', str('upgrade_url') ?? 'https://app.kloakd.dev/settings/billing');
    }
    const bodyRetry = num(detailObj['retry_after']);
    throw new RateLimitError(
      `Rate limit exceeded: ${detail}`,
      retryHeader ?? bodyRetry ?? 60,
      str('reset_at') ?? '',
      { quotaUsed: num(detailObj['quota_used']), quotaLimit: num(detailObj['quota_limit']), upgradeUrl: str('upgrade_url') ?? null },
    );
  }
  if (statusCode === 502) {
    throw new UpstreamError(`Upstream fetch failed: ${detail}`, code);
  }
  if (statusCode === 503 && code === 'billing_unavailable') {
    throw new BillingUnavailableError(detail, retryHeader ?? 30);
  }
  throw new ApiError(`KLOAKD API error ${statusCode}: ${detail}`, statusCode, code);
}
