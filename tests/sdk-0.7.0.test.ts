/**
 * The changes for 0.7.0, each checked against kobe-scraper main
 * 6bd19e9b: held and partial crawls and crawl continue
 * (modules/webgrph/router.py, billing/held_work.py), the crawl of a
 * crawl-extract job and the export's X-Crawl-* headers
 * (modules/webgrph/crawl_extract_router.py), login sessions
 * (modules/fetchyr/router.py), the extraction text (modules/skanyr/router.py)
 * and the fields the API never sent.
 */
import { ApiError, JobFailedError, JobTimeoutError } from '../src/errors.js';
import { exportCrawl } from '../src/_download.js';
import { makeClient, mockFetch, mockFetchSequence, ORG_PREFIX } from './helpers.js';

type Call = [string, RequestInit];
const calls = (f: jest.Mock) => f.mock.calls as unknown as Call[];
const pathOf = (f: jest.Mock, i = 0): string => new URL(calls(f)[i]![0]).pathname.slice(ORG_PREFIX.length + 1);
const methodOf = (f: jest.Mock, i = 0): string => String(calls(f)[i]![1].method);
const bodyOf = (f: jest.Mock, i = 0): Record<string, unknown> =>
  JSON.parse(String(calls(f)[i]![1].body ?? '{}')) as Record<string, unknown>;

const HELD_MESSAGE = 'This crawl is held: your plan has no quota left. It resumes when quota returns.';
/** CrawlStatusResponse of a held crawl (modules/webgrph/router.py:682-697): message set, error null. */
const HELD = {
  crawl_id: 'c1', status: 'held_quota', organization_id: 'o', total_pages: 7, max_depth_reached: 2,
  artifact_id: null, error: null, graph_data: null, message: HELD_MESSAGE,
  pages_discovered: 40, pages_fetched: 7, pages_unfetched: 0, is_partial: null, partial_reason: null,
  resumable: null, error_code: null,
};
const PARTIAL = {
  crawl_id: 'c1', status: 'completed', organization_id: 'o', total_pages: 20, max_depth_reached: 3,
  artifact_id: 'a1', error: null, graph_data: null, message: null,
  pages_discovered: 55, pages_fetched: 20, pages_unfetched: 2, is_partial: true, partial_reason: 'time_budget',
  resumable: true, error_code: null,
};
const NODE = {
  id: '1', url: 'https://s/', parent_url: null, children_urls: [], depth: 0, category: 'page', classification_confidence: 0.9,
  metadata: { title: 'Home', is_grouping: false, fetch_status: 'fetched', fetch_error: null },
};
const PAGES = { crawl_id: 'c1', nodes: [NODE], next_cursor: null, total: 1 };

function textFetch(text: string, status = 200, contentType = 'text/plain; charset=utf-8'): jest.Mock {
  return jest.fn(async () => ({
    status,
    ok: status < 300,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => text,
  }));
}

describe('skanyr.getExtractionText', () => {
  it('returns the plain text the API answers', async () => {
    const f = textFetch('First line\nSecond line {not json}');
    const text = await makeClient(f).skanyr.getExtractionText('ab/12');
    expect(text).toBe('First line\nSecond line {not json}');
    expect([methodOf(f), pathOf(f)]).toEqual(['GET', 'skanyr/extractions/ab%2F12/text']);
  });

  it('an empty extraction is an empty string', async () => {
    expect(await makeClient(textFetch('')).skanyr.getExtractionText('h')).toBe('');
  });

  it('an unknown hash is the API 404, an ApiError', async () => {
    const err = await makeClient(mockFetch({ detail: 'Extraction not found' }, 404)).skanyr.getExtractionText('h').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(404);
  });

  it('is retried like any GET', async () => {
    const f = jest.fn()
      .mockResolvedValueOnce({ status: 503, ok: false, headers: { get: () => null }, text: async () => 'down' })
      .mockResolvedValueOnce({ status: 200, ok: true, headers: { get: () => 'text/plain' }, text: async () => 'ok now' });
    jest.useFakeTimers();
    try {
      const p = makeClient(f).skanyr.getExtractionText('h');
      await jest.advanceTimersByTimeAsync(1500);
      expect(await p).toBe('ok now');
      expect(f).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('a crawl held for quota', () => {
  it('crawl returns it as held at once: not an error, no pages loaded', async () => {
    const f = mockFetchSequence([{ body: { success: true, crawl_id: 'c1', url: 'https://s/' }, status: 202 }, { body: HELD }]);
    const r = await makeClient(f).webgrph.crawl('https://s/', { pollIntervalMs: 1 });
    expect(f).toHaveBeenCalledTimes(2); // start, one status; no pages request
    expect([r.held, r.status, r.success, r.ok, r.error, r.message]).toEqual([true, 'held_quota', false, false, null, HELD_MESSAGE]);
    expect([r.crawlId, r.url, r.pages, r.totalPages, r.pagesDiscovered]).toEqual(['c1', 'https://s/', [], 7, 40]);
  });

  it('waitForCrawl polls a running crawl and stops when it becomes held', async () => {
    const f = mockFetchSequence([{ body: { ...HELD, status: 'crawling', message: null } }, { body: HELD }]);
    const r = await makeClient(f).webgrph.waitForCrawl('c1', { pollIntervalMs: 1 });
    expect(calls(f).map((_, i) => pathOf(f, i))).toEqual(['webgrph/crawl/c1', 'webgrph/crawl/c1']);
    expect([r.held, r.url]).toEqual([true, '']);
  });

  it('waitForCrawl after the quota returned loads the pages of the same crawl', async () => {
    const f = mockFetchSequence([{ body: { ...PARTIAL, is_partial: false, partial_reason: null, resumable: false } }, { body: PAGES }]);
    const r = await makeClient(f).webgrph.waitForCrawl('c1');
    expect([r.held, r.ok, r.pages.length, r.isPartial]).toEqual([false, true, 1, false]);
    expect(pathOf(f, 1)).toBe('webgrph/crawl/c1/pages');
  });

  it('a crawl held for 30 days ends failed with held_quota_expired: JobFailedError', async () => {
    const f = mockFetch({ ...HELD, status: 'failed', message: null, error: 'Held for quota for 30 days', error_code: 'held_quota_expired' });
    const err = await makeClient(f).webgrph.waitForCrawl('c1').catch((e) => e);
    expect(err).toBeInstanceOf(JobFailedError);
    expect(err.jobId).toBe('c1');
  });

  it('a crawl still running at the timeout is JobTimeoutError', async () => {
    const f = mockFetch({ ...HELD, status: 'crawling', message: null });
    await expect(makeClient(f).webgrph.waitForCrawl('c1', { pollIntervalMs: 5, timeoutMs: 1 })).rejects.toBeInstanceOf(JobTimeoutError);
  });

  it('crawlAll gives no pages for a held crawl and does not hang', async () => {
    const f = mockFetchSequence([{ body: { crawl_id: 'c1' }, status: 202 }, { body: HELD }]);
    expect(await makeClient(f).webgrph.crawlAll('https://s/', { pollIntervalMs: 1 })).toEqual([]);
  });

  it('client.crawl reports the held discovery crawl and fetches nothing', async () => {
    const f = mockFetchSequence([{ body: { crawl_id: 'c1' }, status: 202 }, { body: HELD }]);
    const client = makeClient(f);
    const events = [];
    for await (const e of client.crawlStream('https://s/')) events.push(e);
    expect(f).toHaveBeenCalledTimes(2);
    expect(events.map((e) => e.type)).toEqual(['discovery_started', 'discovery_complete', 'crawl_complete']);
    expect(events[1]!.metadata).toMatchObject({ crawlId: 'c1', status: 'held_quota', held: true, message: HELD_MESSAGE });
    const r = events[2]!.metadata['result'] as Awaited<ReturnType<typeof client.crawl>>;
    expect([r.held, r.status, r.crawlId, r.message, r.success, r.error, r.pages]).toEqual([true, 'held_quota', 'c1', HELD_MESSAGE, false, null, []]);
  });
});

describe('partial crawls and continueCrawl', () => {
  it('crawl reads what the crawl covered', async () => {
    const f = mockFetchSequence([{ body: { crawl_id: 'c1' }, status: 202 }, { body: PARTIAL }, { body: PAGES }]);
    const r = await makeClient(f).webgrph.crawl('https://s/', { pollIntervalMs: 1 });
    expect([r.ok, r.held, r.isPartial, r.partialReason, r.resumable]).toEqual([true, false, true, 'time_budget', true]);
    expect([r.pagesDiscovered, r.pagesFetched, r.pagesUnfetched, r.errorCode, r.message]).toEqual([55, 20, 2, null, null]);
    expect([r.pages[0]!.fetchStatus, r.pages[0]!.fetchError]).toEqual(['fetched', null]);
  });

  it('the outcome fields are null when the crawl has not reported them', async () => {
    const f = mockFetchSequence([{ body: { crawl_id: 'c1', status: 'completed', total_pages: 1 } }, { body: PAGES }]);
    const r = await makeClient(f).webgrph.waitForCrawl('c1');
    expect([r.isPartial, r.partialReason, r.resumable, r.pagesDiscovered, r.pagesFetched, r.pagesUnfetched]).toEqual([null, null, null, null, null, null]);
  });

  it('a page the crawl could not fetch carries fetchStatus and fetchError', async () => {
    const f = mockFetch({
      ...PAGES,
      nodes: [
        { ...NODE, url: 'https://s/x', metadata: { fetch_status: 'unfetched', fetch_error: 'HTTP 403' } },
        { ...NODE, url: 'https://s/y', metadata: { fetch_status: 'not_requested' } },
        { ...NODE, url: 'https://s/z', metadata: {} },
      ],
    });
    const { nodes } = await makeClient(f).webgrph.getCrawlPages('c1');
    expect(nodes.map((n) => [n.fetchStatus, n.fetchError])).toEqual([['unfetched', 'HTTP 403'], ['not_requested', null], [null, null]]);
  });

  it('continueCrawl posts to the continue route with no fields and reads the 202', async () => {
    const f = mockFetch({ success: true, crawl_id: 'c 1', status: 'queued' }, 202);
    const r = await makeClient(f).webgrph.continueCrawl('c 1');
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual(['POST', 'webgrph/crawl/c%201/continue', {}]);
    expect(r).toEqual({ success: true, crawlId: 'c 1', status: 'queued' });
  });

  it('a crawl that cannot be continued is the API 409, an ApiError, and is not retried', async () => {
    const f = mockFetch({ detail: 'Crawl cannot be continued: it is not a crawl that stopped at its time budget' }, 409);
    const err = await makeClient(f).webgrph.continueCrawl('c1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(409);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('the start answer has no status and is not read for one', async () => {
    const f = mockFetch({ success: true, crawl_id: 'c1', url: 'https://s/', total_pages: 0, max_depth_reached: 0, artifact_id: null, error: null }, 202);
    const r = await makeClient(f).webgrph.crawl('https://s/', { wait: false });
    expect([r.crawlId, r.status, r.held, r.isPartial]).toEqual(['c1', 'queued', false, null]);
    expect(bodyOf(f)).toEqual({ url: 'https://s/', include_external_links: false }); // no max_depth / max_pages unless given
  });
});

describe('crawl-extract: the job\'s crawl', () => {
  const JOB = {
    job_id: 'j1', crawl_id: 'c1', url: 'https://s/', status: 'crawling', cancel_requested: false,
    progress: { pages_crawled: 3, pages_total: null, pages_extracted: 0, pages_failed: 0, items: 0 },
    error: null, error_code: null, request: {}, links: null, pages_by_method: {}, shapes: [],
  };
  const CRAWL = {
    status: 'completed', is_partial: true, partial_reason: 'max_pages', pages_discovered: 90, pages_fetched: 50,
    pages_unfetched: 1, cancelled: false, root_unfetched: false, error: null, error_code: null,
  };

  it('getCrawlExtract reads the crawl object', async () => {
    const s = await makeClient(mockFetch({ ...JOB, status: 'completed', crawl: CRAWL })).webgrph.getCrawlExtract('j1');
    expect(s.crawl).toEqual({
      status: 'completed', isPartial: true, partialReason: 'max_pages', pagesDiscovered: 90, pagesFetched: 50,
      pagesUnfetched: 1, cancelled: false, rootUnfetched: false, error: null, errorCode: null,
    });
    expect([s.held, s.finished, s.ok]).toEqual([false, true, true]);
  });

  it('counts not yet reported are null; no crawl row is null', async () => {
    const early = await makeClient(mockFetch({ ...JOB, crawl: { status: 'crawling', is_partial: null, pages_discovered: null, cancelled: false, root_unfetched: false } })).webgrph.getCrawlExtract('j1');
    expect([early.crawl!.isPartial, early.crawl!.pagesDiscovered, early.crawl!.partialReason]).toEqual([null, null, null]);
    const none = await makeClient(mockFetch({ ...JOB, crawl: null })).webgrph.getCrawlExtract('j1');
    expect([none.crawl, none.held]).toEqual([null, false]);
    const absent = await makeClient(mockFetch(JOB)).webgrph.getCrawlExtract('j1');
    expect(absent.crawl).toBeNull();
  });

  it('waitForCrawlExtract returns a job whose crawl is held instead of polling to the timeout', async () => {
    const f = mockFetchSequence([
      { body: { ...JOB, crawl: { ...CRAWL, status: 'crawling', is_partial: null } } },
      { body: { ...JOB, crawl: { ...CRAWL, status: 'held_quota', is_partial: null } } },
    ]);
    const s = await makeClient(f).webgrph.waitForCrawlExtract('j1', { pollIntervalMs: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    expect([s.held, s.finished, s.ok, s.status, s.crawl!.status]).toEqual([true, false, false, 'crawling', 'held_quota']);
  });

  it('crawlExtract returns the held job without throwing', async () => {
    const f = mockFetchSequence([
      { body: { job_id: 'j1', crawl_id: 'c1', url: 'https://s/', status: 'queued', limits: {}, links: null }, status: 202 },
      { body: { ...JOB, crawl: { ...CRAWL, status: 'held_quota' } } },
    ]);
    const s = await makeClient(f).webgrph.crawlExtract('https://s/', { pollIntervalMs: 1 });
    expect(s.held).toBe(true);
  });

  it('an ended job is not held, whatever its crawl says', async () => {
    const s = await makeClient(mockFetch({ ...JOB, status: 'cancelled', crawl: { ...CRAWL, status: 'held_quota' } })).webgrph.getCrawlExtract('j1');
    expect([s.held, s.finished]).toEqual([false, true]);
  });
});

describe('export headers', () => {
  function streamFetch(headers: Record<string, string>): jest.Mock {
    return jest.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
      body: new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('[]')); c.close(); } }),
    }));
  }

  it('exportCrawlExtract reads every X-Crawl-* header', async () => {
    const out = await makeClient(streamFetch({
      'x-job-status': 'completed',
      'x-crawl-status': 'completed', 'x-crawl-partial': 'true', 'x-crawl-partial-reason': 'time_budget',
      'x-crawl-pages-discovered': '120', 'x-crawl-pages-fetched': '80', 'x-crawl-pages-unfetched': '3',
      'x-crawl-cancelled': 'false', 'x-crawl-root-unfetched': 'false',
    })).webgrph.exportCrawlExtract('j1');
    expect(out.jobStatus).toBe('completed');
    expect(out.crawl).toEqual({
      status: 'completed', isPartial: true, partialReason: 'time_budget', pagesDiscovered: 120, pagesFetched: 80,
      pagesUnfetched: 3, cancelled: false, rootUnfetched: false,
    });
  });

  it('a header the API left out is null', async () => {
    const out = await makeClient(streamFetch({ 'x-job-status': 'crawling', 'x-crawl-status': 'crawling', 'x-crawl-cancelled': 'false', 'x-crawl-root-unfetched': 'false' })).webgrph.exportCrawlExtract('j1');
    expect(out.crawl).toEqual({
      status: 'crawling', isPartial: null, partialReason: null, pagesDiscovered: null, pagesFetched: null,
      pagesUnfetched: null, cancelled: false, rootUnfetched: false,
    });
  });

  it('no X-Crawl-* header at all gives crawl null', async () => {
    const out = await makeClient(streamFetch({ 'x-job-status': 'completed' })).webgrph.exportCrawlExtract('j1');
    expect([out.jobStatus, out.crawl]).toEqual(['completed', null]);
  });

  it('the batch export sends neither header: jobStatus and crawl are null', async () => {
    const out = await makeClient(streamFetch({ 'content-type': 'application/json', 'content-disposition': 'attachment; filename="batch-b.json"' })).exportBatchJob('b');
    expect([out.filename, out.jobStatus, out.crawl]).toEqual(['batch-b.json', null, null]);
  });

  it('a count that is not a number is null', () => {
    const h = { get: (n: string) => (n === 'x-crawl-pages-fetched' ? 'many' : n === 'x-crawl-partial' ? 'True' : null) };
    expect(exportCrawl(h)).toMatchObject({ pagesFetched: null, isPartial: true });
  });
});

describe('fetchyr login sessions', () => {
  const PROTECTIONS = { max_requests_per_hour: 120 };

  it('startLoginSession sends only the target for the interactive default', async () => {
    const f = mockFetch({
      method: 'interactive', status: 'waiting_for_login', target_url: 'https://site.example/account', discovery_id: 'd1',
      session_artifact_id: null, next: { status: '/fetchyr/auth-chain/d1/status' }, cookies_kept: null, cookies_dropped: [],
      protections: PROTECTIONS, message: 'Give your credentials',
    }, 202);
    const s = await makeClient(f).fetchyr.startLoginSession('https://site.example/account');
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual(['POST', 'fetchyr/login-sessions', { target_url: 'https://site.example/account' }]);
    expect(s).toEqual({
      method: 'interactive', status: 'waiting_for_login', targetUrl: 'https://site.example/account', discoveryId: 'd1',
      sessionArtifactId: null, next: { status: '/fetchyr/auth-chain/d1/status' }, cookiesKept: null, cookiesDropped: [],
      protections: PROTECTIONS, message: 'Give your credentials',
    });
  });

  it('the cookies method sends the cookies, the user agent and the country as the API names them', async () => {
    const f = mockFetch({
      method: 'cookies', status: 'ready', target_url: 'https://site.example/', discovery_id: null, session_artifact_id: 'art-1',
      next: {}, cookies_kept: 1, cookies_dropped: ['_ga'], protections: PROTECTIONS, message: 'Session ready',
    }, 201);
    const cookies = [
      { name: 'sid', value: 'fixture-cookie-value', domain: '.site.example', path: '/', expirationDate: 1800000000, secure: true, httpOnly: true, sameSite: 'Lax' },
      { name: '_ga', value: 'x' },
    ];
    const s = await makeClient(f).fetchyr.startLoginSession('https://site.example/', { method: 'cookies', cookies, userAgent: 'Mozilla/5.0 test', country: 'KE' });
    expect(bodyOf(f)).toEqual({ target_url: 'https://site.example/', method: 'cookies', cookies, user_agent: 'Mozilla/5.0 test', country: 'KE' });
    expect([s.status, s.sessionArtifactId, s.cookiesKept, s.cookiesDropped]).toEqual(['ready', 'art-1', 1, ['_ga']]);
  });

  it('the cookies method without cookies is the API 422, an ApiError', async () => {
    const f = mockFetch({ detail: 'method=cookies needs cookies' }, 422);
    const err = await makeClient(f).fetchyr.startLoginSession('https://site.example/', { method: 'cookies' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(422);
    expect(bodyOf(f)).toEqual({ target_url: 'https://site.example/', method: 'cookies' });
  });

  const PAUSED = {
    artifact_id: 'art-1', status: 'paused', target_domain: 'site.example', auth_method: 'cookies',
    created_at: '2026-11-10T10:00:00+00:00', expires_at: '2026-12-10T10:00:00+00:00', last_used_at: '2026-11-12T09:00:00+00:00',
    paused_at: '2026-11-12T09:00:01+00:00', pause_reason: 'rate_limited', pause_message: 'The site slowed this session',
    identity: { user_agent: 'Mozilla/5.0 test', country: 'KE' }, requests_this_hour: 118, protections: PROTECTIONS,
  };

  it('getSession reads the session state', async () => {
    const f = mockFetch(PAUSED);
    const s = await makeClient(f).fetchyr.getSession('art/1');
    expect([methodOf(f), pathOf(f)]).toEqual(['GET', 'fetchyr/sessions/art%2F1']);
    expect(s).toEqual({
      artifactId: 'art-1', status: 'paused', targetDomain: 'site.example', authMethod: 'cookies',
      createdAt: '2026-11-10T10:00:00+00:00', expiresAt: '2026-12-10T10:00:00+00:00', lastUsedAt: '2026-11-12T09:00:00+00:00',
      pausedAt: '2026-11-12T09:00:01+00:00', pauseReason: 'rate_limited', pauseMessage: 'The site slowed this session',
      identity: { user_agent: 'Mozilla/5.0 test', country: 'KE' }, requestsThisHour: 118, protections: PROTECTIONS,
    });
  });

  it('an active session has null pause fields; an unknown one is a 404', async () => {
    const s = await makeClient(mockFetch({ artifact_id: 'art-1', status: 'active' })).fetchyr.getSession('art-1');
    expect([s.pausedAt, s.pauseReason, s.pauseMessage, s.requestsThisHour, s.identity, s.protections]).toEqual([null, null, null, null, {}, {}]);
    const err = await makeClient(mockFetch({ detail: 'Session not found' }, 404)).fetchyr.getSession('nope').catch((e) => e);
    expect(err.statusCode).toBe(404);
  });

  it('resumeSession posts to the resume route and reads the session', async () => {
    const f = mockFetch({ ...PAUSED, status: 'active', paused_at: null, pause_reason: null, pause_message: null });
    const s = await makeClient(f).fetchyr.resumeSession('art-1');
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual(['POST', 'fetchyr/sessions/art-1/resume', {}]);
    expect([s.status, s.pauseReason]).toEqual(['active', null]);
  });

  it('resuming a session that is not paused is the API 409', async () => {
    const err = await makeClient(mockFetch({ detail: 'The session is not paused' }, 409)).fetchyr.resumeSession('art-1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(409);
  });
});

describe('fields the API never sent are gone; the ones it sends are read', () => {
  it('kolektr: level, levelReason and loginOptions', async () => {
    const f = mockFetch({
      success: true, url: 'https://s/', method: 'l1_css', records: [], total_records: 0, pages_scraped: 1, artifact: null,
      job_id: null, error: null, level: 'level2', level_reason: 'auto: the page needs a browser', auth_required: true,
      discovery_id: 'd1', login_options: { interactive: { method: 'POST' } },
    });
    const r = await makeClient(f).kolektr.page('https://s/');
    expect([r.level, r.levelReason, r.loginOptions, r.authRequired]).toEqual(['level2', 'auto: the page needs a browser', { interactive: { method: 'POST' } }, true]);
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['hasMore', 'total']));
    const bare = await makeClient(mockFetch({ success: true })).kolektr.page('https://s/');
    expect([bare.level, bare.levelReason, bare.loginOptions]).toEqual([null, null, null]);
  });

  it('nexus results have no error field; ok says what it can', async () => {
    const analyze = await makeClient(mockFetch({ url: 'u', page_type: 'listing', confidence: 0.5, strategy: {}, perception_id: 'p' })).nexus.analyze('u', '<html/>');
    const synth = await makeClient(mockFetch({ url: 'u', goal: 'g', program: 'x', strategy_name: 'n', steps: [], strategy_id: 's' })).nexus.synthesize('u', '<html/>', 'g');
    const verify = await makeClient(mockFetch({ strategy_id: 's', verified: false, violations: ['v'], safety_score: 0.1 })).nexus.verify('s');
    for (const r of [analyze, synth, verify]) expect(r).not.toHaveProperty('error');
    expect([analyze.ok, synth.ok, verify.ok]).toEqual([true, true, false]);
  });

  it('nexus.reason sends timeout_secs when given', async () => {
    const f = mockFetch({ success: true, results: [] });
    await makeClient(f).nexus.reason('q', ['a'], { timeoutSecs: 2.5 });
    expect(bodyOf(f)).toEqual({ query_type: 'q', parameters: ['a'], timeout_secs: 2.5 });
  });
});
