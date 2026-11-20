/**
 * robots.txt stops and their acknowledgement (GAP-DOC-35), checked against
 * kobe-scraper core/compliance/robots.py: `RobotsAcknowledgementField`
 * (`robots_acknowledged_hosts`, at most 50 bare hosts, this request only),
 * `stop_detail` (409 `ROBOTS_DISALLOWED`) and `unavailable` (503
 * `ROBOTS_CHECK_UNAVAILABLE`, reason `exits_refused` when every exit refused
 * the site). Every answer here is a mock's.
 */
import {
  ConcurrencyLimitError,
  KloakdError,
  RobotsCheckUnavailableError,
  RobotsDisallowedError,
  RobotsExitsRefusedError,
  raiseForStatus,
} from '../src/errors.js';
import * as sdk from '../src/index.js';
import { makeClient, mockSseEventFetch, ORG_PREFIX } from './helpers.js';

type Call = [string, RequestInit];
const calls = (f: jest.Mock) => f.mock.calls as unknown as Call[];
const urlOf = (f: jest.Mock, i = 0): URL => new URL(calls(f)[i]![0]);
const pathOf = (f: jest.Mock, i = 0): string => urlOf(f, i).pathname.slice(ORG_PREFIX.length + 1);
const bodyOf = (f: jest.Mock, i = 0): Record<string, unknown> | undefined => {
  const body = calls(f)[i]![1].body;
  return body === undefined ? undefined : (JSON.parse(String(body)) as Record<string, unknown>);
};

const HOSTS = ['www.reddit.com'];
const ACK = { robots_acknowledged_hosts: HOSTS };

/** A fetch that answers every request 200 with `body`. */
function ok(body: Record<string, unknown> = {}): jest.Mock {
  return jest.fn(async () => ({
    status: 200,
    ok: true,
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
    json: async () => body,
  }));
}

/** A fetch whose answers are `responses`, in order (the last repeats). */
function answers(responses: Array<{ status: number; body: Record<string, unknown>; headers?: Record<string, string> }>): jest.Mock {
  let i = 0;
  return jest.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : r.headers?.[h.toLowerCase()] ?? null) },
      json: async () => r.body,
    };
  });
}

/** stop_detail of core/compliance/robots.py. */
const STOP = {
  error: 'ROBOTS_DISALLOWED',
  code: 'ROBOTS_DISALLOWED',
  reason: 'disallowed',
  host: 'www.reddit.com',
  url: 'https://www.reddit.com/r/Python/',
  rule: 'Disallow: /',
  message: 'www.reddit.com does not allow this in its robots.txt (rule: Disallow: /).',
  acknowledge_field: 'robots_acknowledged_hosts',
  terms_version: 'draft-2026-11-19',
};

describe('robots_acknowledged_hosts is sent by every route that takes it', () => {
  const cases: Array<[string, string, (c: ReturnType<typeof makeClient>) => Promise<unknown>]> = [
    ['evadr.fetch', 'evadr/fetch', (c) => c.evadr.fetch('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['evadr.fetchAsync', 'evadr/fetch/async', (c) => c.evadr.fetchAsync('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['evadr.scan', 'evadr/scan', (c) => c.evadr.scan('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['evadr.profile', 'evadr/profile', (c) => c.evadr.profile('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['kolektr.page', 'kolektr/extract', (c) => c.kolektr.page('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['kolektr.pageAll', 'kolektr/extract', (c) => c.kolektr.pageAll('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['webgrph.startCrawl', 'webgrph/crawl', (c) => c.webgrph.startCrawl('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['webgrph.crawl (no wait)', 'webgrph/crawl', (c) => c.webgrph.crawl('https://www.reddit.com/', { wait: false, robotsAcknowledgedHosts: HOSTS })],
    ['webgrph.estimateCrawl', 'webgrph/crawl/estimate', (c) => c.webgrph.estimateCrawl('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['webgrph.mapSite', 'webgrph/map', (c) => c.webgrph.mapSite('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['webgrph.readerView', 'webgrph/reader-view', (c) => c.webgrph.readerView('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['webgrph.startCrawlExtract', 'webgrph/crawl-extract', (c) => c.webgrph.startCrawlExtract('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['webgrph.estimateCrawlExtract', 'webgrph/crawl-extract/estimate', (c) => c.webgrph.estimateCrawlExtract('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['skanyr.sync', 'skanyr/sync', (c) => c.skanyr.sync('site-1', { robotsAcknowledgedHosts: HOSTS })],
    ['unifiedScrape', 'scraping/unified', (c) => c.unifiedScrape('https://www.reddit.com/', { robotsAcknowledgedHosts: HOSTS })],
    ['createBatchJob', 'batch-jobs', (c) => c.createBatchJob(['https://www.reddit.com/'], { robotsAcknowledgedHosts: HOSTS })],
  ];

  it.each(cases)('%s', async (_name, path, call) => {
    const fetch = ok({ success: true, crawl_id: 'c-1', job_id: 'j-1', status: 'queued' });
    await call(makeClient(fetch));
    expect(pathOf(fetch)).toBe(path);
    expect(bodyOf(fetch)).toMatchObject(ACK);
  });

  it('an empty list is not sent', async () => {
    const fetch = ok({ success: true });
    await makeClient(fetch).evadr.fetch('https://e.com', { robotsAcknowledgedHosts: [] });
    expect(bodyOf(fetch)).toEqual({ url: 'https://e.com' });
  });

  it('left out, the body is as before', async () => {
    const fetch = ok({ success: true });
    await makeClient(fetch).evadr.scan('https://e.com');
    expect(bodyOf(fetch)).toEqual({ url: 'https://e.com' });
  });

  it('continueCrawl sends a body with only the hosts, and none without options', async () => {
    const fetch = ok({ success: true, crawl_id: 'c-1', status: 'queued' });
    const client = makeClient(fetch);
    await client.webgrph.continueCrawl('c-1', { robotsAcknowledgedHosts: HOSTS });
    expect(pathOf(fetch)).toBe('webgrph/crawl/c-1/continue');
    expect(bodyOf(fetch)).toEqual(ACK);
    await client.webgrph.continueCrawl('c-1');
    expect(bodyOf(fetch, 1)).toBeUndefined();
  });

  it('continueCrawlExtract sends the hosts with the other options', async () => {
    const fetch = ok({ success: true, job_id: 'j-1', crawl_id: 'c-1', status: 'queued' });
    await makeClient(fetch).webgrph.continueCrawlExtract('j-1', { maxPages: 50, robotsAcknowledgedHosts: HOSTS });
    expect(pathOf(fetch)).toBe('webgrph/crawl-extract/j-1/continue');
    expect(bodyOf(fetch)).toEqual({ max_pages: 50, ...ACK });
  });

  it('extractAllApiData sends the hosts in the query string, once per host', async () => {
    const fetch = ok({ job_id: 'j-1' });
    await makeClient(fetch).kolektr.extractAllApiData('https://api.e.com/v1/items', {
      maxRecords: 10,
      robotsAcknowledgedHosts: ['api.e.com', 'cdn.e.com'],
    });
    const url = urlOf(fetch);
    expect(url.searchParams.getAll('robots_acknowledged_hosts')).toEqual(['api.e.com', 'cdn.e.com']);
    expect(url.searchParams.get('max_records')).toBe('10');
    expect(bodyOf(fetch)).toEqual({});
  });

  it('extractAllApiData without hosts sends no query field', async () => {
    const fetch = ok({ job_id: 'j-1' });
    await makeClient(fetch).kolektr.extractAllApiData('https://api.e.com/v1/items');
    expect(urlOf(fetch).search).toBe('');
  });

  it('extractHtml does not take it (it fetches nothing)', async () => {
    const fetch = ok({ success: true });
    await makeClient(fetch).kolektr.extractHtml('<html></html>', 'https://e.com');
    expect(bodyOf(fetch)).not.toHaveProperty('robots_acknowledged_hosts');
  });

  it('parlyr.chat and chatStream send it with the turn', async () => {
    const fetch = mockSseEventFetch([{ event: 'end', data: {} }]);
    const client = makeClient(fetch);
    await client.parlyr.chat('s-1', 'scrape reddit', { robotsAcknowledgedHosts: HOSTS });
    expect(bodyOf(fetch)).toEqual({ session_id: 's-1', message: 'scrape reddit', ...ACK });
    for await (const _ of client.parlyr.chatStream('s-1', 'again')) void _;
    expect(bodyOf(fetch, 1)).toEqual({ session_id: 's-1', message: 'again' });
  });

  it('the crawl orchestrator sends it with the crawl, each fetch and each extraction', async () => {
    const fetch = jest.fn(async (url: string) => {
      const path = new URL(url).pathname.slice(ORG_PREFIX.length + 1);
      const body =
        path === 'webgrph/crawl' ? { crawl_id: 'c-1' }
        : path === 'webgrph/crawl/c-1' ? { crawl_id: 'c-1', status: 'completed', total_pages: 1 }
        : path === 'webgrph/crawl/c-1/pages'
          ? { crawl_id: 'c-1', next_cursor: null, total: 1, nodes: [{ id: '1', url: 'https://www.reddit.com/a', parent_url: null, children_urls: [], depth: 0, metadata: {} }] }
        : path === 'evadr/fetch' ? { success: true, url: 'https://www.reddit.com/a', status_code: 200, html: '<p/>', artifact_id: 'a-1' }
        : { success: true, records: [{ t: 1 }] };
      return { status: 200, ok: true, headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) }, json: async () => body };
    });
    await makeClient(fetch).crawl('https://www.reddit.com/', {
      extractSchema: { t: 'css:h1' },
      robotsAcknowledgedHosts: HOSTS,
    });
    const posts = calls(fetch as unknown as jest.Mock).filter(([, init]) => init.method === 'POST');
    const sent = posts.map(([url, init]) => [new URL(url).pathname.slice(ORG_PREFIX.length + 1), JSON.parse(String(init.body))]);
    expect(sent.map(([p]) => p)).toEqual(['webgrph/crawl', 'evadr/fetch', 'kolektr/extract']);
    for (const [, body] of sent) expect(body).toMatchObject(ACK);
  });
});

describe('a robots.txt stop', () => {
  it('409 ROBOTS_DISALLOWED is RobotsDisallowedError with the stop, not retried', async () => {
    const fetch = answers([{ status: 409, body: { detail: STOP } }]);
    const err = await makeClient(fetch).evadr.fetch('https://www.reddit.com/r/Python/').catch((e) => e);
    expect(err).toBeInstanceOf(RobotsDisallowedError);
    expect(err).toBeInstanceOf(KloakdError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('ROBOTS_DISALLOWED');
    expect(err.reason).toBe('disallowed');
    expect(err.unreadable).toBe(false);
    expect(err.host).toBe('www.reddit.com');
    expect(err.rule).toBe('Disallow: /');
    expect(err.url).toBe('https://www.reddit.com/r/Python/');
    expect(err.redirectedFrom).toBeNull();
    expect(err.termsVersion).toBe('draft-2026-11-19');
    expect(err.acknowledgeField).toBe('robots_acknowledged_hosts');
    expect(err.message).toBe(STOP.message);
    expect(fetch.mock.calls).toHaveLength(1);
  });

  it('reads an unreadable stop and a stop after a redirect', async () => {
    const detail = { ...STOP, reason: 'unreadable', rule: null, redirected_from: 'https://reddit.com/r/Python/' };
    const err = await makeClient(answers([{ status: 409, body: { detail } }])).kolektr.page('https://reddit.com/r/Python/').catch((e) => e);
    expect(err).toBeInstanceOf(RobotsDisallowedError);
    expect(err.unreadable).toBe(true);
    expect(err.rule).toBe('');
    expect(err.redirectedFrom).toBe('https://reddit.com/r/Python/');
  });

  it('calling again with the host acknowledged goes past it', async () => {
    const fetch = answers([
      { status: 409, body: { detail: STOP } },
      { status: 200, body: { success: true, url: STOP.url, status_code: 200, html: '<title>Python</title>' } },
    ]);
    const client = makeClient(fetch);
    let result;
    try {
      result = await client.evadr.fetch(STOP.url);
    } catch (e) {
      if (!(e instanceof RobotsDisallowedError)) throw e;
      result = await client.evadr.fetch(STOP.url, { robotsAcknowledgedHosts: [e.host] });
    }
    expect(result.ok).toBe(true);
    expect(bodyOf(fetch, 0)).toEqual({ url: STOP.url });
    expect(bodyOf(fetch, 1)).toEqual({ url: STOP.url, ...ACK });
  });

  it('a crawl start stopped by robots.txt throws from webgrph.crawl', async () => {
    const err = await makeClient(answers([{ status: 409, body: { detail: STOP } }])).webgrph.crawl(STOP.url).catch((e) => e);
    expect(err).toBeInstanceOf(RobotsDisallowedError);
  });

  it('other 409s are unchanged', async () => {
    const limit = await makeClient(answers([{ status: 409, body: { detail: { error: 'concurrent_limit', message: 'All slots busy', concurrent_limit: 2 } } }]))
      .evadr.scan('https://e.com').catch((e) => e);
    expect(limit).toBeInstanceOf(ConcurrencyLimitError);
    const other = await makeClient(answers([{ status: 409, body: { detail: { error: 'not_continuable', message: 'no' } } }]))
      .evadr.scan('https://e.com').catch((e) => e);
    expect(other).not.toBeInstanceOf(RobotsDisallowedError);
    expect(other.code).toBe('not_continuable');
  });

  it('RobotsDisallowedError.fromDetail reads a chat error event', () => {
    const stop = RobotsDisallowedError.fromDetail(STOP);
    expect(stop?.host).toBe('www.reddit.com');
    expect(RobotsDisallowedError.fromDetail({ message: 'other' })).toBeNull();
    expect(RobotsDisallowedError.fromDetail(null)).toBeNull();
  });
});

describe('robots.txt could not be read (503)', () => {
  const UNAVAILABLE = {
    error: 'ROBOTS_CHECK_UNAVAILABLE',
    code: 'ROBOTS_CHECK_UNAVAILABLE',
    host: 'www.gov.uk',
    message: 'KLOAKD could not read the robots.txt of www.gov.uk.',
    retry_after_s: 30,
  };

  it('ROBOTS_CHECK_UNAVAILABLE is RobotsCheckUnavailableError, retried after Retry-After', async () => {
    const fetch = answers([{ status: 503, body: { detail: UNAVAILABLE }, headers: { 'retry-after': '0' } }]);
    const err = await makeClient(fetch).evadr.fetch('https://www.gov.uk/').catch((e) => e);
    expect(err).toBeInstanceOf(RobotsCheckUnavailableError);
    expect(err).not.toBeInstanceOf(RobotsExitsRefusedError);
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('ROBOTS_CHECK_UNAVAILABLE');
    expect(err.host).toBe('www.gov.uk');
    expect(err.reason).toBe('');
    expect(err.retryAfter).toBe(0);
    expect(fetch.mock.calls).toHaveLength(4); // first try + 3 retries, on a POST
  });

  it('the retry succeeds once the check is back', async () => {
    const fetch = answers([
      { status: 503, body: { detail: UNAVAILABLE }, headers: { 'retry-after': '0' } },
      { status: 200, body: { success: true, status_code: 200 } },
    ]);
    const result = await makeClient(fetch).evadr.fetch('https://www.gov.uk/');
    expect(result.success).toBe(true);
    expect(fetch.mock.calls).toHaveLength(2);
  });

  it('without Retry-After, retryAfter is retry_after_s', () => {
    try {
      raiseForStatus(503, { detail: UNAVAILABLE });
    } catch (e) {
      expect(e).toBeInstanceOf(RobotsCheckUnavailableError);
      expect((e as RobotsCheckUnavailableError).retryAfter).toBe(30);
      return;
    }
    throw new Error('not thrown');
  });

  it('reason exits_refused is RobotsExitsRefusedError and is not retried', async () => {
    const fetch = answers([
      { status: 503, body: { detail: { ...UNAVAILABLE, reason: 'exits_refused', message: 'Every exit refused the connection to www.gov.uk.' } }, headers: { 'retry-after': '0' } },
    ]);
    const err = await makeClient(fetch).webgrph.startCrawl('https://www.gov.uk/').catch((e) => e);
    expect(err).toBeInstanceOf(RobotsExitsRefusedError);
    expect(err).toBeInstanceOf(RobotsCheckUnavailableError);
    expect(err.reason).toBe('exits_refused');
    expect(err.host).toBe('www.gov.uk');
    expect(err.message).toBe('Every exit refused the connection to www.gov.uk.');
    expect(fetch.mock.calls).toHaveLength(1);
  });
});

describe('exports', () => {
  it('the package exports the robots errors and the field name', () => {
    expect(sdk.RobotsDisallowedError).toBe(RobotsDisallowedError);
    expect(sdk.RobotsCheckUnavailableError).toBe(RobotsCheckUnavailableError);
    expect(sdk.RobotsExitsRefusedError).toBe(RobotsExitsRefusedError);
    expect(sdk.ROBOTS_ACKNOWLEDGE_FIELD).toBe('robots_acknowledged_hosts');
  });
});
