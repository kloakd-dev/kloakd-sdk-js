/**
 * The 0.5.0 fixes, each checked against the API's behaviour (paths under
 * kobe-scraper/src/kobe_scraper/ are named in each test).
 */
import { Kloakd } from '../src/client.js';
import { SDK_VERSION, USER_AGENT } from '../src/_http.js';
import { toSchemaSpec } from '../src/modules/kolektr.js';
import {
  ApiError,
  AuthenticationError,
  BillingUnavailableError,
  ConcurrencyLimitError,
  ForbiddenError,
  JobTimeoutError,
  NotEntitledError,
  PaymentRequiredError,
  QuotaExceededError,
  RateLimitError,
  raiseForStatus,
} from '../src/errors.js';
import { callUrl, makeClient, ORG_PREFIX, parseCallBody, TEST_API_KEY, TEST_ORG_ID } from './helpers.js';

type Answer = { status: number; body?: unknown; text?: string; headers?: Record<string, string> };
type Recorder = jest.Mock<Promise<unknown>, [string, RequestInit]>;

/** A fetch that answers each call with the next answer (the last repeats); a thrown Error is a network error. */
function answers(...list: Array<Answer | Error>): Recorder {
  let i = 0;
  return jest.fn(async (_url: string, _init: RequestInit) => {
    void _url; void _init;
    const a = list[Math.min(i++, list.length - 1)]!;
    if (a instanceof Error) throw a;
    const isJson = a.body !== undefined;
    const hdr: Record<string, string> = { ...(isJson ? { 'content-type': 'application/json' } : { 'content-type': 'text/html' }), ...(a.headers ?? {}) };
    const text = isJson ? JSON.stringify(a.body) : (a.text ?? '');
    return {
      status: a.status,
      ok: a.status < 400,
      headers: { get: (h: string) => hdr[h.toLowerCase()] ?? null },
      text: async () => text,
      json: async () => JSON.parse(text),
      arrayBuffer: async () => new TextEncoder().encode(text).buffer,
      body: undefined,
    };
  });
}

const client = (f: Recorder, maxRetries = 3) =>
  new Kloakd({ apiKey: TEST_API_KEY, organizationId: TEST_ORG_ID, fetchImpl: f as unknown as typeof fetch, maxRetries });
const calls = (f: Recorder) => f.mock.calls as unknown as unknown[][];
const methodOf = (c: unknown[]) => (c[1] as RequestInit).method;

describe('version and headers', () => {
  it('is 0.5.0 and sends User-Agent kloakd-sdk-js/0.5.0', async () => {
    expect(SDK_VERSION).toBe('0.5.0');
    expect(USER_AGENT).toBe('kloakd-sdk-js/0.5.0');
    const f = answers({ status: 200, body: {} });
    await client(f).evadr.scan('u');
    const headers = (calls(f)[0]![1] as { headers: Record<string, string> }).headers;
    expect(headers['User-Agent']).toBe('kloakd-sdk-js/0.5.0');
    expect(headers['X-Kloakd-SDK']).toBe('typescript/0.5.0');
  });
});

describe('default timeout', () => {
  it('is 100 s (above the API 85 s synchronous wait, kernel/sync_handoff.py)', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    await client(answers({ status: 200, body: {} })).evadr.scan('u');
    expect(spy).toHaveBeenCalledWith(100_000);
    spy.mockRestore();
  });

  it('timeout is in seconds', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    const f = answers({ status: 200, body: {} });
    await new Kloakd({ apiKey: 'k', organizationId: 'o', fetchImpl: f as unknown as typeof fetch, timeout: 7 }).evadr.scan('u');
    expect(spy).toHaveBeenCalledWith(7000);
    spy.mockRestore();
  });
});

describe('retries', () => {
  beforeEach(() => jest.useFakeTimers({ advanceTimers: true }));
  afterEach(() => jest.useRealTimers());

  it('a 500 on POST is not retried', async () => {
    const f = answers({ status: 500, body: { detail: 'boom' } });
    await expect(client(f).evadr.scan('u')).rejects.toBeInstanceOf(ApiError);
    expect(calls(f)).toHaveLength(1);
  });

  it('a 502 on PATCH is not retried', async () => {
    const f = answers({ status: 502, body: { detail: 'x' } });
    await expect(client(f).skanyr.updateSite('s', 'full')).rejects.toThrow('Upstream');
    expect(calls(f)).toHaveLength(1);
  });

  it('a 503 on GET is retried, then succeeds', async () => {
    const f = answers({ status: 503, body: { detail: 'x' } }, { status: 200, body: { id: 'site-1' } });
    expect(await client(f).skanyr.getSite('s')).toEqual({ id: 'site-1' });
    expect(calls(f)).toHaveLength(2);
  });

  it('a 500 on DELETE is retried up to maxRetries', async () => {
    const f = answers({ status: 500, body: {} });
    await expect(client(f, 2).skanyr.deleteSite('s')).rejects.toBeInstanceOf(ApiError);
    expect(calls(f)).toHaveLength(3);
  });

  it('a network error is retried on GET, not on POST', async () => {
    const g = answers(new TypeError('fetch failed'), { status: 200, body: { ok: 1 } });
    expect(await client(g).skanyr.getSite('s')).toEqual({ ok: 1 });
    expect(calls(g)).toHaveLength(2);
    const p = answers(new TypeError('fetch failed'));
    await expect(client(p).evadr.scan('u')).rejects.toThrow('fetch failed');
    expect(calls(p)).toHaveLength(1);
  });

  it('429 rate_limited is retried on POST after Retry-After', async () => {
    const f = answers(
      { status: 429, body: { detail: { error: 'rate_limited', message: 'slow', retry_after: 1, reset_at: '2026-10-28T00:00:01Z' } }, headers: { 'retry-after': '1' } },
      { status: 200, body: { done: true } },
    );
    expect(await client(f).evadr.scan('u')).toEqual({ done: true });
    expect(calls(f).map(methodOf)).toEqual(['POST', 'POST']);
  });

  it('429 with retry_after 0 and a reset_at waits until reset_at', async () => {
    const f = answers(
      { status: 429, body: { detail: { error: 'rate_limited', retry_after: 0, reset_at: new Date(Date.now() + 10).toISOString() } } },
      { status: 200, body: { done: true } },
    );
    expect(await client(f).evadr.scan('u')).toEqual({ done: true });
    expect(calls(f)).toHaveLength(2);
  });

  it('the playground quota (retry_after 0, no reset_at; kernel/gateway/rate_limiter.py) is not retried and carries the quota', async () => {
    const f = answers({
      status: 429,
      headers: { 'retry-after': '0' },
      body: { detail: { error: 'rate_limited', message: 'Rate limit exceeded. Retry after 0s.', retry_after: 0, reset_at: '', quota_used: 10, quota_limit: 10, upgrade_url: 'https://app.kloakd.dev/pricing' } },
    });
    const err = await client(f).evadr.scan('u').catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect([err.quotaExhausted, err.quotaUsed, err.quotaLimit, err.upgradeUrl]).toEqual([true, 10, 10, 'https://app.kloakd.dev/pricing']);
    expect(calls(f)).toHaveLength(1);
  });

  it('503 billing_unavailable is retried on POST (no work was done)', async () => {
    const f = answers(
      { status: 503, headers: { 'retry-after': '0' }, body: { detail: { error: 'billing_unavailable', message: 'Usage could not be checked', reason: 'check_failed' } } },
      { status: 200, body: { done: true } },
    );
    expect(await client(f).evadr.scan('u')).toEqual({ done: true });
    expect(calls(f)).toHaveLength(2);
  });

  it('429 gb_exhausted and 402 are not retried', async () => {
    const q = answers({ status: 429, body: { detail: { error: 'gb_exhausted', message: 'used', tier: 'pro' } } });
    await expect(client(q).skanyr.getSite('s')).rejects.toBeInstanceOf(QuotaExceededError);
    expect(calls(q)).toHaveLength(1);
    const p = answers({ status: 402, body: { detail: { error: 'payment_required', message: 'pay' } } });
    await expect(client(p).skanyr.getSite('s')).rejects.toBeInstanceOf(PaymentRequiredError);
    expect(calls(p)).toHaveLength(1);
  });
});

describe('error mapping', () => {
  it('403 not_entitled is NotEntitledError (kernel/gateway/errors.py)', () => {
    const err = (() => { try { raiseForStatus(403, { detail: { error: 'not_entitled', message: 'm', module: 'nexus', upgrade_url: 'u' } }); } catch (e) { return e; } })() as NotEntitledError;
    expect(err).toBeInstanceOf(NotEntitledError);
    expect([err.module, err.upgradeUrl, err.code]).toEqual(['nexus', 'u', 'not_entitled']);
  });

  it('403 tier_access_denied is NotEntitledError with feature and tiers (billing/tier_policy.py)', () => {
    const err = (() => { try {
      raiseForStatus(403, { detail: { error: 'tier_access_denied', current_tier: 'free', required_tier: 'pro', feature: 'payg_topup', message: 'Upgrade to buy GB', upgrade_url: '/pricing' } });
    } catch (e) { return e; } })() as NotEntitledError;
    expect(err).toBeInstanceOf(NotEntitledError);
    expect([err.feature, err.currentTier, err.requiredTier, err.code, err.message]).toEqual(['payg_topup', 'free', 'pro', 'tier_access_denied', 'Upgrade to buy GB']);
  });

  it('any other 403 is ForbiddenError, not NotEntitledError', () => {
    const err = (() => { try { raiseForStatus(403, { detail: 'Not your organization' }); } catch (e) { return e; } })() as ForbiddenError;
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err).not.toBeInstanceOf(NotEntitledError);
    expect(err.message).toContain('Not your organization');
  });

  it('409 concurrent_limit is ConcurrencyLimitError (kernel/gateway/dependencies.py)', () => {
    const err = (() => { try {
      raiseForStatus(409, { detail: { error: 'concurrent_limit', message: 'Concurrent crawl limit reached (3 for pro tier).', tier: 'pro', concurrent_limit: 3, active_crawls: 3 } });
    } catch (e) { return e; } })() as ConcurrencyLimitError;
    expect(err).toBeInstanceOf(ConcurrencyLimitError);
    expect([err.statusCode, err.concurrentLimit, err.activeCrawls, err.tier]).toEqual([409, 3, 3, 'pro']);
  });

  it('a 409 without that code stays ApiError', () => {
    expect(() => raiseForStatus(409, { detail: 'conflict' })).toThrow(ApiError);
  });

  it('422 keeps the validation messages from detail[]', () => {
    expect(() => raiseForStatus(422, { detail: [
      { loc: ['body', 'url'], msg: 'Field required', type: 'missing' },
      { loc: ['body', 'parameters', 0], msg: 'Input should be a valid string', type: 'string_type' },
    ] })).toThrow('body.url: Field required; body.parameters.0: Input should be a valid string');
  });

  it('a non-JSON error body does not crash; its text is the message', async () => {
    const f = answers({ status: 502, text: '<html>Bad gateway</html>' });
    const err = await client(f).evadr.scan('u').catch((e) => e);
    expect(err.message).toContain('<html>Bad gateway</html>');
    const g = answers({ status: 401, text: '' });
    await expect(client(g).evadr.scan('u')).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('a JSON content-type with a broken body does not crash', async () => {
    const f = jest.fn(async () => ({
      status: 500, ok: false, headers: { get: () => 'application/json' }, text: async () => '{not json',
    }));
    const err = await client(f as unknown as Recorder, 0).evadr.scan('u').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain('{not json');
  });
});

describe('hand-off', () => {
  it('getHandoff reads GET handoff/{job_id} (kernel/sync_handoff.py)', async () => {
    const f = answers({ status: 200, body: { status: 'running' } });
    expect(await client(f).getHandoff('job 1')).toEqual({ status: 'running' });
    expect(callUrl(calls(f)[0]!)).toBe(`https://api.kloakd.dev${ORG_PREFIX}/handoff/job%201`);
  });

  it('waitForHandoff follows the job to its result', async () => {
    const f = answers({ status: 200, body: { status: 'running' } }, { status: 200, body: { status: 'completed', result: { records: [1] } } });
    expect(await client(f).waitForHandoff('j-1', { pollIntervalMs: 1 })).toEqual({ records: [1] });
  });

  it('a timed-out wait throws JobTimeoutError carrying the job id', async () => {
    const f = answers({ status: 200, body: { status: 'running' } });
    const err = await client(f).waitForHandoff('j-2', { pollIntervalMs: 5, pollTimeoutMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobTimeoutError);
    expect(err.jobId).toBe('j-2');
  });
});

describe('client.crawl', () => {
  const crawlAnswers = (status: Record<string, unknown>, ...pageAnswers: Answer[]) => answers(
    { status: 202, body: { crawl_id: 'c-1', success: true, url: 'u', total_pages: 0, max_depth_reached: 0 } },
    { status: 200, body: { crawl_id: 'c-1', organization_id: 'o', ...status } },
    { status: 200, body: { crawl_id: 'c-1', nodes: [{ url: 'https://e.com/a' }, { url: 'https://e.com/b' }], next_cursor: null, total: 2 } },
    ...pageAnswers,
  );

  it('does not send max_depth or max_pages unless set (webgrph/router.py CrawlRequest)', async () => {
    const f = crawlAnswers({ status: 'completed', total_pages: 0 });
    await client(f).crawl('https://e.com').catch(() => undefined);
    const body = parseCallBody(calls(f)[0]!);
    expect('max_depth' in body || 'max_pages' in body).toBe(false);
  });

  it("copies the crawl's success and error into the result", async () => {
    const page = { status: 200, body: { success: true, url: 'x', status_code: 200, tier_used: 1, html: '<p/>' } };
    const f = crawlAnswers({ status: 'cancelled', total_pages: 2, error: 'cancelled by user' }, page, page);
    const r = await client(f).crawl('https://e.com');
    expect([r.success, r.error, r.pagesFetched]).toEqual([false, 'cancelled by user', 2]);
  });

  it('records an ordinary page failure on the page', async () => {
    const f = crawlAnswers({ status: 'completed', total_pages: 2 },
      { status: 400, body: { detail: 'bad url' } },
      { status: 200, body: { success: true, url: 'x', status_code: 200, tier_used: 1, html: '<p/>' } });
    const r = await client(f).crawl('https://e.com');
    expect([r.success, r.pagesFetched, r.pagesFailed]).toEqual([true, 1, 1]);
    expect(r.pages[0]!.error).toContain('bad url');
  });

  it.each([
    ['402 payment_required', { status: 402, body: { detail: { error: 'payment_required', message: 'pay' } } }, PaymentRequiredError],
    ['429 gb_exhausted', { status: 429, body: { detail: { error: 'gb_exhausted', message: 'used' } } }, QuotaExceededError],
    ['401', { status: 401, body: { detail: 'bad key' } }, AuthenticationError],
    ['403 not_entitled', { status: 403, body: { detail: { error: 'not_entitled', module: 'evadr' } } }, NotEntitledError],
  ])('a %s on a page stops the crawl and is thrown', async (_n, answer, cls) => {
    const f = crawlAnswers({ status: 'completed', total_pages: 2 }, answer as Answer);
    await expect(client(f, 0).crawl('https://e.com')).rejects.toBeInstanceOf(cls);
  });

  it('billing errors in the extraction step are thrown too', async () => {
    const f = crawlAnswers({ status: 'completed', total_pages: 2 },
      { status: 200, body: { success: true, url: 'x', status_code: 200, tier_used: 1, html: '<p/>', artifact: { artifact_id: 'a', type: 't' } } },
      { status: 503, headers: { 'retry-after': '0' }, body: { detail: { error: 'billing_unavailable' } } });
    await expect(client(f, 0).crawl('https://e.com', { extractSchema: { title: 'css:h1' } })).rejects.toBeInstanceOf(BillingUnavailableError);
  });

  it('sends the extract schema converted to fields', async () => {
    const f = crawlAnswers({ status: 'completed', total_pages: 1 },
      { status: 200, body: { success: true, url: 'x', status_code: 200, tier_used: 1, html: '<p/>' } },
      { status: 200, body: { success: true, url: 'x', method: 'css', records: [{ title: 'T' }] } });
    const r = await client(f).crawl('https://e.com', { extractSchema: { title: 'css:h1' } });
    expect(r.pages[0]!.structuredData).toEqual({ title: 'T' });
    expect(parseCallBody(calls(f)[4]!)['schema_spec']).toEqual({ fields: [{ name: 'title', selector: 'h1' }] });
  });
});

describe('extraction schema (kolektr/router.py SchemaSpec)', () => {
  it('converts the shorthand, prefix optional', () => {
    expect(toSchemaSpec({ title: 'css:h1', price: '.price' })).toEqual({ fields: [{ name: 'title', selector: 'h1' }, { name: 'price', selector: '.price' }] });
  });
  it('accepts an explicit list of fields', () => {
    expect(toSchemaSpec([{ name: 'title', selector: 'h1', attribute: 'title' }])).toEqual({ fields: [{ name: 'title', selector: 'h1', attribute: 'title' }] });
  });
  it('passes a full spec through with the API names', () => {
    expect(toSchemaSpec({ fields: [{ name: 'a' }], pagination: true, maxPages: 3 })).toEqual({ fields: [{ name: 'a' }], pagination: true, max_pages: 3 });
  });
});

describe('result fields', () => {
  it('fetch and extraction results carry auth_required and discovery_id (evadr/router.py, kolektr/router.py)', async () => {
    const f = answers({ status: 200, body: { success: true, url: 'u', status_code: 200, tier_used: 1, html: null, auth_required: true, discovery_id: 'd-1' } });
    const r = await client(f).evadr.fetch('u');
    expect([r.authRequired, r.discoveryId, r.html]).toEqual([true, 'd-1', null]);
    const g = answers({ status: 200, body: { success: true, url: 'u', method: 'm', auth_required: true, discovery_id: 'd-2' } });
    const e = await client(g).kolektr.page('u');
    expect([e.authRequired, e.discoveryId]).toEqual([true, 'd-2']);
    const h = answers({ status: 200, body: { success: true, url: 'u', status_code: 200, tier_used: 1, html: '<p/>' } });
    const plain = await client(h).evadr.fetch('u');
    expect([plain.authRequired, plain.discoveryId]).toEqual([false, null]);
  });
});

describe('request shapes', () => {
  it('skanyr.updateSite sends policy as a string (skanyr/router.py SiteUpdateRequest)', async () => {
    const f = answers({ status: 200, body: {} });
    await client(f).skanyr.updateSite('s-1', 'head_first');
    expect(parseCallBody(calls(f)[0]!)).toEqual({ policy: 'head_first' });
  });

  it('skanyr.exportSite returns the zip bytes', async () => {
    const f = answers({ status: 200, text: 'PK\u0003\u0004', headers: { 'content-type': 'application/zip' } });
    const bytes = await client(f).skanyr.exportSite('s-1');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
  });

  it('skanyr list calls return arrays', async () => {
    const f = answers({ status: 200, body: [{ id: 'r' }] });
    const c = client(f);
    for (const out of [await c.skanyr.getSiteApis('s'), await c.skanyr.getSiteResources('s'), await c.skanyr.getFindings('s'),
      await c.skanyr.getTechnologies('s'), await c.skanyr.listResources()]) {
      expect(Array.isArray(out)).toBe(true);
    }
  });

  it('fetchyr multi-site dependencies are a list (fetchyr/router.py SiteDependencyModel)', async () => {
    const f = answers({ status: 200, body: { id: 'w' } });
    await client(f).fetchyr.createMultiSiteWorkflow('w', [{ site_id: 'a', name: 'A', url: 'https://a' }], {
      description: 'd',
      dependencies: [{ dependentSite: 'b', dependencySite: 'a' }, { dependentSite: 'c', dependencySite: 'b', dependencyType: 'data', dataRequirements: ['token'] }],
      globalConfig: { x: 1 },
    });
    expect(parseCallBody(calls(f)[0]!)).toEqual({
      name: 'w',
      sites: [{ site_id: 'a', name: 'A', url: 'https://a' }],
      description: 'd',
      dependencies: [
        { dependent_site: 'b', dependency_site: 'a' },
        { dependent_site: 'c', dependency_site: 'b', dependency_type: 'data', data_requirements: ['token'] },
      ],
      global_config: { x: 1 },
    });
  });

  it('list calls send the paging parameters', async () => {
    const f = answers({ status: 200, body: {} });
    const c = client(f);
    await c.kolektr.listJobs({ page: 2, limit: 5, statusFilter: 'failed' });
    await c.kolektr.listScrapers({ page: 1, pageSize: 10, isTemplate: true });
    await c.kolektr.listContent({ page: 3, pageSize: 4, search: 'shoes' });
    await c.fetchyr.listWorkflows({ page: 2, pageSize: 50 });
    await c.kolektr.extractAllApiData('https://api.e.com/v1/items', { endpointHash: 'h', maxRecords: 100 });
    await c.kolektr.getApiData('https://api.e.com/v1/items', { endpointHash: 'h' });
    const q = calls(f).map((x) => new URL(callUrl(x)).search);
    expect(q).toEqual([
      '?page=2&limit=5&status_filter=failed',
      '?page=1&page_size=10&is_template=true',
      '?page=3&page_size=4&search=shoes',
      '?page=2&page_size=50',
      '?endpoint_hash=h&max_records=100',
      '?endpoint_hash=h',
    ]);
  });

  it('path segments are URL-encoded, including the api-data endpoint', async () => {
    const f = answers({ status: 200, body: {} });
    const c = client(f);
    await c.kolektr.getApiDataPaginated('https://api.e.com/v1/items?x=1', 0, 10);
    await c.kolektr.getJob('a/b');
    await c.skanyr.getSite('s 1');
    const paths = calls(f).map((x) => callUrl(x).split('?')[0]);
    expect(paths).toEqual([
      `https://api.kloakd.dev${ORG_PREFIX}/kolektr/api-data/https%3A%2F%2Fapi.e.com%2Fv1%2Fitems%3Fx%3D1/paginated`,
      `https://api.kloakd.dev${ORG_PREFIX}/kolektr/jobs/a%2Fb`,
      `https://api.kloakd.dev${ORG_PREFIX}/skanyr/sites/s%201`,
    ]);
  });

  it('list calls with no options send no query string', async () => {
    const f = answers({ status: 200, body: {} });
    await makeClient(f as never).kolektr.listJobs();
    expect(callUrl(calls(f)[0]!)).toBe(`https://api.kloakd.dev${ORG_PREFIX}/kolektr/jobs`);
  });
});
