import { makeClient, mockFetch, mockFetchSequence, mockSseFetch, parseCallBody, callUrl } from './helpers.js';

const PAGE_NODE = { url: 'https://example.com', depth: 0, title: 'Home', status_code: 200, children: [] };
const CRAWL_RESPONSE = {
  success: true,
  crawl_id: 'crawl-001',
  url: 'https://example.com',
  total_pages: 1,
  max_depth_reached: 0,
  pages: [PAGE_NODE],
  artifact_id: 'art-hier-001',
  error: null,
  has_more: false,
  total: 1,
};

describe('webgrph.crawl', () => {
  it('returns CrawlResult with PageNodes', async () => {
    const client = makeClient(mockFetch(CRAWL_RESPONSE));
    const result = await client.webgrph.crawl('https://example.com');
    expect(result.success).toBe(true);
    expect(result.crawlId).toBe('crawl-001');
    expect(result.artifactId).toBe('art-hier-001');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.url).toBe('https://example.com');
    expect(result.pages[0]!.title).toBe('Home');
    expect(result.ok).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it('passes maxDepth and maxPages', async () => {
    const fetch = mockFetch(CRAWL_RESPONSE);
    const client = makeClient(fetch);
    await client.webgrph.crawl('https://example.com', { maxDepth: 5, maxPages: 500 });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['max_depth']).toBe(5);
    expect(body['max_pages']).toBe(500);
  });

  it('passes sessionArtifactId', async () => {
    const fetch = mockFetch(CRAWL_RESPONSE);
    const client = makeClient(fetch);
    await client.webgrph.crawl('https://example.com', { sessionArtifactId: 'sess-001' });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['session_artifact_id']).toBe('sess-001');
  });
});

describe('webgrph.crawlAll', () => {
  it('auto-paginates and returns all pages', async () => {
    const p1 = { ...CRAWL_RESPONSE, has_more: true, total: 2, pages: [PAGE_NODE] };
    const p2 = { ...CRAWL_RESPONSE, has_more: false, total: 2, pages: [{ ...PAGE_NODE, url: 'https://example.com/about' }] };
    const client = makeClient(mockFetchSequence([{ body: p1 }, { body: p2 }]));
    const pages = await client.webgrph.crawlAll('https://example.com');
    expect(pages).toHaveLength(2);
    expect(pages[1]!.url).toBe('https://example.com/about');
  });
});

describe('webgrph.getHierarchy', () => {
  it('calls correct path', async () => {
    const fetch = mockFetch({ artifact_id: 'art-001', nodes: [] });
    const client = makeClient(fetch);
    await client.webgrph.getHierarchy('art-001');
    const url = callUrl((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(url).toContain('webgrph/hierarchy/art-001');
  });
});

describe('webgrph.getJob', () => {
  it('calls correct path', async () => {
    const fetch = mockFetch({ job_id: 'job-001', status: 'completed' });
    const client = makeClient(fetch);
    await client.webgrph.getJob('job-001');
    const url = callUrl((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(url).toContain('webgrph/jobs/job-001');
  });
});

describe('webgrph.crawlStream', () => {
  it('yields CrawlEvent objects', async () => {
    const client = makeClient(mockSseFetch([
      { type: 'page_found', url: 'https://example.com', depth: 0, pages_found: 1, metadata: {} },
      { type: 'done', url: null, depth: null, pages_found: 1, metadata: {} },
    ]));
    const events = [];
    for await (const event of client.webgrph.crawlStream('https://example.com')) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('page_found');
    expect(events[0]!.url).toBe('https://example.com');
    expect(events[0]!.pagesFound).toBe(1);
    expect(events[1]!.type).toBe('done');
  });
});
