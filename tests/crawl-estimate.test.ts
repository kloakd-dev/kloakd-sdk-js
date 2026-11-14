/**
 * Crawl estimate, continue with options and the status time budget, as the
 * crawl-estimate API contract (CRAWL-ESTIMATE-CONTRACT.md, 14 Nov 2026)
 * gives them: sections 1-3.
 */
import { ApiError } from '../src/errors.js';
import { makeClient, mockFetch, mockFetchSequence, ORG_PREFIX } from './helpers.js';

type Call = [string, RequestInit];
const calls = (f: jest.Mock) => f.mock.calls as unknown as Call[];
const pathOf = (f: jest.Mock, i = 0): string => new URL(calls(f)[i]![0]).pathname.slice(ORG_PREFIX.length + 1);
const methodOf = (f: jest.Mock, i = 0): string => String(calls(f)[i]![1].method);
const rawBody = (f: jest.Mock, i = 0): unknown => calls(f)[i]![1].body;
const bodyOf = (f: jest.Mock, i = 0): Record<string, unknown> => JSON.parse(String(rawBody(f, i))) as Record<string, unknown>;

/** The contract's 200 example (section 1). */
const ESTIMATE = {
  mode: 'crawl',
  url: 'https://example.com/',
  max_depth: 2,
  max_pages: 10,
  plan_limits: { max_depth: 5, max_pages: 500, plan_tier: 'free' },
  clamped: false,
  site: { reachable: true, sitemap_pages: 1234, homepage_links: 57, probe_error: null },
  est_pages: { low: 10, high: 10, source: 'sitemap' },
  will_hit_page_cap: true,
  time_budget_s: 120,
  est_duration_s: { low: 40, high: 120 },
  est_gb: 0.03,
  gb_remaining: 4.2,
  will_exhaust_quota: false,
  warning: null,
  explanation: 'A crawl maps the site: it finds the pages and how they link, without pulling data from them.',
};

describe('estimateCrawl', () => {
  it('posts the url and the given limits to webgrph/crawl/estimate', async () => {
    const f = mockFetch(ESTIMATE);
    await makeClient(f).webgrph.estimateCrawl('https://example.com/', { maxDepth: 2, maxPages: 10 });
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual([
      'POST', 'webgrph/crawl/estimate', { url: 'https://example.com/', max_depth: 2, max_pages: 10 },
    ]);
  });

  it('sends no limit that was not given', async () => {
    const f = mockFetch(ESTIMATE);
    await makeClient(f).webgrph.estimateCrawl('https://example.com/');
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/' });
  });

  it('reads every field of the estimate', async () => {
    const r = await makeClient(mockFetch(ESTIMATE)).webgrph.estimateCrawl('https://example.com/');
    expect(r).toEqual({
      mode: 'crawl',
      url: 'https://example.com/',
      maxDepth: 2,
      maxPages: 10,
      planLimits: { maxDepth: 5, maxPages: 500, planTier: 'free' },
      clamped: false,
      site: { reachable: true, sitemapPages: 1234, homepageLinks: 57, probeError: null },
      estPages: { low: 10, high: 10, source: 'sitemap' },
      willHitPageCap: true,
      timeBudgetS: 120,
      estDurationS: { low: 40, high: 120 },
      estGb: 0.03,
      gbRemaining: 4.2,
      willExhaustQuota: false,
      warning: null,
      explanation: ESTIMATE.explanation,
    });
  });

  it('a failed probe reads as nulls with source limit', async () => {
    const f = mockFetch({
      ...ESTIMATE,
      clamped: true,
      site: { reachable: false, sitemap_pages: null, homepage_links: null, probe_error: 'timeout' },
      est_pages: { low: 1, high: 10, source: 'limit' },
      gb_remaining: null,
      warning: 'The site did not answer.',
    });
    const r = await makeClient(f).webgrph.estimateCrawl('https://example.com/');
    expect(r.site).toEqual({ reachable: false, sitemapPages: null, homepageLinks: null, probeError: 'timeout' });
    expect([r.estPages.source, r.gbRemaining, r.clamped, r.warning]).toEqual(['limit', null, true, 'The site did not answer.']);
  });
});

describe('estimateCrawlExtract', () => {
  it('posts the limits and the extract spec to webgrph/crawl-extract/estimate', async () => {
    const f = mockFetch({ ...ESTIMATE, mode: 'crawl_extract' });
    const r = await makeClient(f).webgrph.estimateCrawlExtract('https://example.com/', {
      maxPages: 10,
      extract: { entityType: 'product', fields: ['name', 'price'], schema: { fields: [], itemSelector: '.p' } },
    });
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual([
      'POST', 'webgrph/crawl-extract/estimate',
      {
        url: 'https://example.com/', max_pages: 10,
        extract: { entity_type: 'product', fields: ['name', 'price'], schema: { fields: [], item_selector: '.p' } },
      },
    ]);
    expect(r.mode).toBe('crawl_extract');
  });

  it('sends only the url when nothing else is given', async () => {
    const f = mockFetch({ ...ESTIMATE, mode: 'crawl_extract' });
    await makeClient(f).webgrph.estimateCrawlExtract('https://example.com/');
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/' });
  });
});

describe('continue with options', () => {
  it('continueCrawl with options sends only the given values', async () => {
    const f = mockFetch({ success: true, crawl_id: 'c1', status: 'queued' }, 202);
    const r = await makeClient(f).webgrph.continueCrawl('c1', { maxPages: 200 });
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual(['POST', 'webgrph/crawl/c1/continue', { max_pages: 200 }]);
    expect(r).toEqual({ success: true, crawlId: 'c1', status: 'queued' });
  });

  it('continueCrawl with both values sends both', async () => {
    const f = mockFetch({ success: true, crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.continueCrawl('c1', { maxPages: 200, maxDepth: 4 });
    expect(bodyOf(f)).toEqual({ max_pages: 200, max_depth: 4 });
  });

  it('continueCrawl with empty options sends no body', async () => {
    const f = mockFetch({ success: true, crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.continueCrawl('c1', {});
    expect(rawBody(f)).toBeUndefined();
  });

  it('a lower value is the API 422, an ApiError', async () => {
    const f = mockFetch({ error: 'continue_cannot_lower' }, 422);
    const err = await makeClient(f).webgrph.continueCrawl('c1', { maxPages: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(422);
  });

  it('continueCrawlExtract without options posts no body and reads the answer', async () => {
    const f = mockFetch({ success: true, job_id: 'j 1', crawl_id: 'c1', status: 'queued' }, 202);
    const r = await makeClient(f).webgrph.continueCrawlExtract('j 1');
    expect([methodOf(f), pathOf(f), rawBody(f)]).toEqual(['POST', 'webgrph/crawl-extract/j%201/continue', undefined]);
    expect(r).toEqual({ success: true, jobId: 'j 1', crawlId: 'c1', status: 'queued' });
  });

  it('continueCrawlExtract with options sends them', async () => {
    const f = mockFetch({ success: true, job_id: 'j1', crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.continueCrawlExtract('j1', { maxDepth: 3, maxPages: 50 });
    expect(bodyOf(f)).toEqual({ max_pages: 50, max_depth: 3 });
  });

  it('a job that cannot be continued is the API 409', async () => {
    const f = mockFetch({ error: 'not_resumable', detail: 'not resumable' }, 409);
    const err = await makeClient(f).webgrph.continueCrawlExtract('j1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(409);
  });
});

describe('the status time budget', () => {
  const PAGES = { nodes: [], next_cursor: null, total: 0 };

  it('a crawl reads time_budget_s, elapsed_s and est_remaining_s', async () => {
    const f = mockFetchSequence([
      { body: { crawl_id: 'c1', status: 'completed', total_pages: 0, time_budget_s: 150, elapsed_s: 42.5, est_remaining_s: 107.5 } },
      { body: PAGES },
    ]);
    const r = await makeClient(f).webgrph.waitForCrawl('c1');
    expect([r.timeBudgetS, r.elapsedS, r.estRemainingS]).toEqual([150, 42.5, 107.5]);
  });

  it('they are null until the crawl reports them', async () => {
    const f = mockFetchSequence([{ body: { crawl_id: 'c1', status: 'completed', total_pages: 0 } }, { body: PAGES }]);
    const r = await makeClient(f).webgrph.waitForCrawl('c1');
    expect([r.timeBudgetS, r.elapsedS, r.estRemainingS]).toEqual([null, null, null]);
  });

  const JOB = {
    job_id: 'j1', crawl_id: 'c1', url: 'https://s/', status: 'crawling', cancel_requested: false,
    progress: { pages_crawled: 3, pages_total: null, pages_extracted: 0, pages_failed: 0, items: 0 },
    error: null, error_code: null, request: {}, links: null, pages_by_method: {}, shapes: [],
  };

  it('a crawl-extract job reads them', async () => {
    const f = mockFetch({ ...JOB, time_budget_s: 300, elapsed_s: 12, est_remaining_s: 288 });
    const r = await makeClient(f).webgrph.getCrawlExtract('j1');
    expect([r.timeBudgetS, r.elapsedS, r.estRemainingS]).toEqual([300, 12, 288]);
  });

  it('a crawl-extract job has them null until reported', async () => {
    const r = await makeClient(mockFetch(JOB)).webgrph.getCrawlExtract('j1');
    expect([r.timeBudgetS, r.elapsedS, r.estRemainingS]).toEqual([null, null, null]);
  });
});
