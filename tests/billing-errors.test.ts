/** 402, 429 and 503 from the billing gate are distinct, typed errors. */
import {
  BillingUnavailableError,
  PaymentRequiredError,
  QuotaExceededError,
  RateLimitError,
} from '../src/errors.js';
import { Kloakd } from '../src/client.js';
import { makeClient } from './helpers.js';

declare const jest: { fn: (impl?: (...args: unknown[]) => unknown) => { mock: { calls: unknown[][] } } };

function respond(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return jest.fn(async () => ({
    status,
    ok: false,
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : headers[h.toLowerCase()] ?? null) },
    json: async () => body,
  }));
}

const client = (fetch: unknown) => makeClient(fetch as never);

describe('billing errors', () => {
  it('402 payment_required is PaymentRequiredError and is not retried', async () => {
    const fetch = respond(402, { detail: { error: 'payment_required', message: 'Your last payment did not go through.', upgrade_url: '/settings/billing' } });
    const err = await client(fetch).evadr.scan('https://e.com').catch((e) => e);
    expect(err).toBeInstanceOf(PaymentRequiredError);
    expect(err.message).toBe('Your last payment did not go through.');
    expect(fetch.mock.calls).toHaveLength(1);
  });

  it('429 gb_exhausted is QuotaExceededError and is not retried', async () => {
    const fetch = respond(429, { detail: { error: 'gb_exhausted', message: 'Monthly allocation used', tier: 'pro' } });
    const err = await client(fetch).evadr.scan('https://e.com').catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.tier).toBe('pro');
    expect(fetch.mock.calls).toHaveLength(1);
  });

  it('429 rate_limited is RateLimitError with Retry-After', async () => {
    const fetch = respond(429, { detail: { error: 'rate_limited', retry_after: 7 } }, { 'retry-after': '0' });
    const client = new Kloakd({ apiKey: 'k', organizationId: 'o', fetchImpl: fetch as never, maxRetries: 0 });
    const err = await client.evadr.scan('https://e.com').catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(0);
  });

  it('503 billing_unavailable is BillingUnavailableError, retried after Retry-After', async () => {
    const fetch = respond(503, { detail: { error: 'billing_unavailable', message: 'Usage could not be checked', reason: 'check_failed' } }, { 'retry-after': '0' });
    const err = await client(fetch).evadr.scan('https://e.com').catch((e) => e);
    expect(err).toBeInstanceOf(BillingUnavailableError);
    expect(err.retryAfter).toBe(0);
    expect(fetch.mock.calls).toHaveLength(4); // first try + 3 retries
  });
});
