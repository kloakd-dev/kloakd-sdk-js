import { JobFailedError } from '../src/errors.js';
import { callUrl, makeClient, mockFetch, mockFetchSequence, mockSseFetch, ORG_PREFIX, parseCallBody } from './helpers.js';

type Calls = { mock: { calls: unknown[][] } };
const NODE = { id: 'n1', url: 'https://example.com', depth: 0, category: 'page', children_urls: ['https://example.com/a'], metadata: { title: 'Home' } };

describe('webgrph.crawl', () => {
  it('starts the crawl, waits for it, and loads every page', async () => {
    const fetch = mockFetchSequence([
      { body: { success: true, crawl_id: 'crawl-1', url: 'https://example.com', total_pages: 0, max_depth_reached: 0 }, status: 202 },
      { body: { crawl_id: 'crawl-1', status: 'crawling', organization_id: 'o' } },
      { body: { crawl_id: 'crawl-1', status: 'completed', organization_id: 'o', total_pages: 2, artifact_id: 'art-1' } },
      { body: { crawl_id: 'crawl-1', nodes: [NODE], next_cursor: 'cur-2', total: 2 } },
      { body: { crawl_id: 'crawl-1', nodes: [{ ...NODE, id: 'n2', url: 'https://example.com/a', depth: 1 }], next_cursor: null, total: 2 } },
    ]);
    const client = makeClient(fetch);
    const result = await client.webgrph.crawl('https://example.com', { maxDepth: 2, pollIntervalMs: 1 });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.crawlId).toBe('crawl-1');
    expect(result.artifactId).toBe('art-1');
    expect(result.pages.map((p) => p.url)).toEqual(['https://example.com', 'https://example.com/a']);
    expect(result.pages[0]!.title).toBe('Home');
    expect(result.pages[0]!.children).toEqual(['https://example.com/a']);
    const calls = (fetch as unknown as Calls).mock.calls;
    expect(parseCallBody(calls[0]!)['max_depth']).toBe(2);
    expect('max_pages' in parseCallBody(calls[0]!)).toBe(false);
    expect(callUrl(calls[4]!)).toContain(`${ORG_PREFIX}/webgrph/crawl/crawl-1/pages?limit=500&cursor=cur-2`);
  });

  it('a failed crawl throws JobFailedError', async () => {
    const fetch = mockFetchSequence([
      { body: { crawl_id: 'crawl-2' }, status: 202 },
      { body: { crawl_id: 'crawl-2', status: 'failed', error: 'dispatch failed' } },
    ]);
    await expect(makeClient(fetch).webgrph.crawl('https://example.com', { pollIntervalMs: 1 })).rejects.toBeInstanceOf(JobFailedError);
  });

  it('wait: false returns the crawl id at once', async () => {
    const fetch = mockFetch({ crawl_id: 'crawl-3' }, 202);
    const result = await makeClient(fetch).webgrph.crawl('https://example.com', { wait: false });
    expect(result.crawlId).toBe('crawl-3');
    expect(result.status).toBe('queued');
    expect((fetch as unknown as Calls).mock.calls).toHaveLength(1);
  });
});

describe('webgrph.crawlStream', () => {
  it('starts a crawl and streams its events', async () => {
    const start = mockFetch({ crawl_id: 'crawl-4' }, 202);
    const events = mockSseFetch([{ pipeline_id: 'crawl-4', event_type: 'pipeline_step', stage_id: 'bfs', status: 'running',
      message: 'Crawling', sub_status: 'Discovered 15/500 pages', progress_pct: 3, metadata: {}, error: null, sequence: 7 }]);
    const fetch = jest.fn((url: string, init: RequestInit) => (init.method === 'POST' ? start(url, init) : events(url, init)));
    const out = [];
    for await (const e of makeClient(fetch).webgrph.crawlStream('https://example.com')) out.push(e);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ eventType: 'pipeline_step', stageId: 'bfs', status: 'running', message: 'Crawling',
      progressPct: 3, metadata: {}, error: null, sequence: 7, crawlId: 'crawl-4' });
    expect(callUrl(fetch.mock.calls[1]!)).toContain('/webgrph/crawl/crawl-4/events');
  });
});

describe('webgrph.startCrawl', () => {
  it('sends max_depth and max_pages only when set, so the API applies the tier default', async () => {
    const fetch = mockFetch({ crawl_id: 'c' }, 202);
    await makeClient(fetch).webgrph.startCrawl('https://example.com');
    expect(parseCallBody((fetch as unknown as Calls).mock.calls[0]!)).toEqual({ url: 'https://example.com', include_external_links: false });
  });
});

describe('webgrph.listSessions', () => {
  it('always sends active_only', async () => {
    const f1 = mockFetch([] as unknown as Record<string, unknown>);
    await makeClient(f1).webgrph.listSessions();
    expect(callUrl((f1 as unknown as Calls).mock.calls[0]!)).toContain('/webgrph/sessions?active_only=true');
    const f2 = mockFetch([] as unknown as Record<string, unknown>);
    await makeClient(f2).webgrph.listSessions({ activeOnly: false });
    expect(callUrl((f2 as unknown as Calls).mock.calls[0]!)).toContain('/webgrph/sessions?active_only=false');
  });
});

describe('webgrph sessions and reader view (moved from skanyr)', () => {
  it('reader view posts to webgrph/reader-view', async () => {
    const fetch = mockFetch({ title: 'T' });
    await makeClient(fetch).webgrph.readerView('https://example.com/a', { crawlId: 'c1' });
    const call = (fetch as unknown as Calls).mock.calls[0]!;
    expect(callUrl(call)).toBe(`https://api.kloakd.dev${ORG_PREFIX}/webgrph/reader-view`);
    expect(parseCallBody(call)).toEqual({ url: 'https://example.com/a', crawl_id: 'c1' });
  });

  it('updateSessionJob sends the job id as a query parameter', async () => {
    const fetch = mockFetch({ id: 's1' });
    await makeClient(fetch).webgrph.updateSessionJob('s1', 'job-9');
    const call = (fetch as unknown as Calls).mock.calls[0]!;
    expect(callUrl(call)).toContain('/webgrph/sessions/s1/job?job_id=job-9');
    expect((call[1] as RequestInit).method).toBe('PATCH');
  });
});
