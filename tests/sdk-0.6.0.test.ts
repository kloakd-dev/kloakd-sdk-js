/**
 * The 0.6.0 changes, each checked against the API deployed on 2 November 2026
 * (paths under kobe-scraper/src/kobe_scraper/ are named in each test).
 */
import { Kloakd } from '../src/client.js';
import { toSchemaSpec } from '../src/modules/kolektr.js';
import { CRAWL_PAGES_MAX_LIMIT } from '../src/index.js';
import { ApiError, ConcurrencyLimitError, raiseForStatus } from '../src/errors.js';
import { makeClient, mockFetch, mockFetchSequence, TEST_API_KEY, TEST_ORG_ID } from './helpers.js';

const ITEMS = {
  success: true,
  url: 'https://books.toscrape.com/',
  method: 'l1_css',
  records: [
    { title: 'A Light in the Attic', price: '£51.77' },
    { title: 'Tipping the Velvet', price: '£53.74' },
  ],
  total_records: 2,
  error: null,
};

type Call = [string, RequestInit];
const calls = (f: jest.Mock) => f.mock.calls as unknown as Call[];
const callUrl = (f: jest.Mock, i = 0): string => calls(f)[i]![0];
const parseCallBody = (f: jest.Mock, i = 0): Record<string, unknown> =>
  JSON.parse(String(calls(f)[i]![1].body ?? '{}')) as Record<string, unknown>;

describe('item_selector (GAP-API-11, modules/kolektr/router.py SchemaSpec)', () => {
  it('itemSelector option is sent as schema_spec.item_selector with the shorthand', async () => {
    const f = mockFetch(ITEMS);
    const r = await makeClient(f).kolektr.page('https://books.toscrape.com/', {
      schema: { title: 'css:h3 a', price: 'css:p.price_color' },
      itemSelector: 'article.product_pod',
    });
    expect(parseCallBody(f)['schema_spec']).toEqual({
      fields: [
        { name: 'title', selector: 'h3 a' },
        { name: 'price', selector: 'p.price_color' },
      ],
      item_selector: 'article.product_pod',
    });
    expect(r.records).toHaveLength(2);
    expect(r.totalRecords).toBe(2);
  });

  it('shorthand fields can carry attribute and type', () => {
    expect(
      toSchemaSpec(
        { title: { selector: 'css:h3 a', attribute: 'title' }, tags: { selector: '.tag', type: 'list' }, link: { attribute: 'href' } },
        'li.item',
      ),
    ).toEqual({
      fields: [
        { name: 'title', selector: 'h3 a', attribute: 'title' },
        { name: 'tags', selector: '.tag', type: 'list' },
        { name: 'link', attribute: 'href' },
      ],
      item_selector: 'li.item',
    });
  });

  it('SchemaSpec.itemSelector is mapped to item_selector; the option takes its place', () => {
    const spec = { fields: [{ name: 'title', selector: 'h3 a', attribute: 'title', type: 'text' }], itemSelector: 'article', maxPages: 2 };
    expect(toSchemaSpec(spec)).toEqual({
      fields: [{ name: 'title', selector: 'h3 a', attribute: 'title', type: 'text' }],
      item_selector: 'article',
      max_pages: 2,
    });
    expect(toSchemaSpec(spec, 'li')['item_selector']).toBe('li');
  });

  it('a list of fields takes an item selector, trimmed', () => {
    expect(toSchemaSpec([{ name: 'n' }], '  div.card ')).toEqual({ fields: [{ name: 'n' }], item_selector: 'div.card' });
  });

  it('without an item selector the body is the 0.5.0 one', async () => {
    const f = mockFetch(ITEMS);
    await makeClient(f).kolektr.page('u', { schema: { title: 'css:h1' } });
    expect(parseCallBody(f)['schema_spec']).toEqual({ fields: [{ name: 'title', selector: 'h1' }] });
    expect(toSchemaSpec({ fields: [{ name: 'a' }] })).toEqual({ fields: [{ name: 'a' }] });
  });

  it('refuses an empty item selector, one with no fields, or one with no schema (the API 422s)', async () => {
    expect(() => toSchemaSpec({ a: 'h1' }, '  ')).toThrow(/must not be empty/);
    expect(() => toSchemaSpec([], 'div')).toThrow(/at least one field/);
    expect(() => toSchemaSpec({ fields: [], itemSelector: 'div' })).toThrow(/at least one field/);
    const f = mockFetch(ITEMS);
    await expect(makeClient(f).kolektr.page('u', { itemSelector: 'div' })).rejects.toThrow(/needs a schema/);
    expect(f).not.toHaveBeenCalled();
  });

  it('extractHtml sends the item selector to kolektr/extract/html', async () => {
    const f = mockFetch(ITEMS);
    await makeClient(f).kolektr.extractHtml('<html/>', 'https://x', { schema: { t: 'h3' }, itemSelector: 'article' });
    expect(callUrl(f)).toContain('/kolektr/extract/html');
    expect(parseCallBody(f)['schema_spec']).toEqual({ fields: [{ name: 't', selector: 'h3' }], item_selector: 'article' });
  });

  it("invalid CSS is the API's 422, an ApiError", async () => {
    const f = mockFetch({ detail: [{ msg: "Value error, invalid CSS selector 'a[': ..." }] }, 422);
    await expect(makeClient(f).kolektr.page('u', { schema: { t: 'h3' }, itemSelector: 'a[' })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('crawl pages (GAP-API-9/10, modules/webgrph/router.py get_crawl_pages)', () => {
  const PAGE = {
    crawl_id: 'c1',
    nodes: [
      { id: '1', url: 'https://s/', parent_url: null, children_urls: ['https://s/a'], depth: 0, category: 'page', metadata: { title: 'Home', is_grouping: false } },
      { id: '2', url: 'https://s/#path-catalogue', parent_url: 'https://s/', children_urls: [], depth: 1, category: 'group', metadata: { is_grouping: true } },
    ],
    next_cursor: null,
    total: 2,
  };

  it('sends include_grouping=true only when asked, and reads metadata.is_grouping', async () => {
    const f = mockFetchSequence([{ body: PAGE }, { body: PAGE }]);
    const wg = makeClient(f).webgrph;
    const plain = await wg.getCrawlPages('c1');
    expect(new URL(callUrl(f, 0)).searchParams.has('include_grouping')).toBe(false);
    const grouped = await wg.getCrawlPages('c1', { includeGrouping: true, limit: 1000 });
    const q = new URL(callUrl(f, 1)).searchParams;
    expect([q.get('include_grouping'), q.get('limit')]).toEqual(['true', '1000']);
    expect(plain.nodes.map((n) => n.isGrouping)).toEqual([false, true]);
    expect(grouped.nodes[1]!.parentUrl).toBe('https://s/');
    expect(grouped.nodes[0]!.crawlParentUrl).toBeNull();
  });

  it('refuses a limit outside 1–1000 before sending (the API 422s)', async () => {
    const f = mockFetch(PAGE);
    const wg = makeClient(f).webgrph;
    for (const limit of [0, -1, CRAWL_PAGES_MAX_LIMIT + 1, 2.5]) {
      await expect(wg.getCrawlPages('c1', { limit })).rejects.toBeInstanceOf(RangeError);
    }
    expect(f).not.toHaveBeenCalled();
    await wg.getCrawlPages('c1', { limit: 1 });
    expect(new URL(callUrl(f)).searchParams.get('limit')).toBe('1');
  });

  it('crawlAllPages keeps limit and includeGrouping on every page', async () => {
    const f = mockFetchSequence([
      { body: { ...PAGE, next_cursor: '1' } },
      { body: PAGE },
    ]);
    await makeClient(f).webgrph.crawlAllPages('c1', { limit: 1, includeGrouping: true });
    const qs = calls(f).map(([u]) => new URL(u).searchParams);
    expect(qs.map((q) => [q.get('limit'), q.get('include_grouping'), q.get('cursor')])).toEqual([
      ['1', 'true', null],
      ['1', 'true', '1'],
    ]);
  });

  it('crawl({includeGrouping}) does not send it with the crawl, only to the pages listing', async () => {
    const f = mockFetchSequence([
      { body: { crawl_id: 'c1' }, status: 202 },
      { body: { crawl_id: 'c1', status: 'completed', total_pages: 1, max_depth_reached: 0 } },
      { body: PAGE },
    ]);
    const r = await makeClient(f).webgrph.crawl('https://s/', { includeGrouping: true });
    expect(parseCallBody(f, 0)).not.toHaveProperty('include_grouping');
    expect(new URL(calls(f)[2]![0]).searchParams.get('include_grouping')).toBe('true');
    expect(r.totalPages).toBe(1);
  });

  it('reads crawl_parent_url and is_grouping from a stored page record', async () => {
    const f = mockFetch({
      crawl_id: 'c1',
      nodes: [{ url: 'https://s/b', parent_url: 'https://s/#g', is_grouping: false, crawl_parent_url: 'https://s/a', depth: 2 }],
      total: 1,
    });
    const { nodes } = await makeClient(f).webgrph.getCrawlPages('c1');
    expect([nodes[0]!.isGrouping, nodes[0]!.crawlParentUrl]).toEqual([false, 'https://s/a']);
  });

  it("a bad cursor is the API's 422, an ApiError", async () => {
    const f = mockFetch({ detail: 'cursor must be a non-negative integer returned as next_cursor' }, 422);
    await expect(makeClient(f).webgrph.getCrawlPages('c1', { cursor: 'x' })).rejects.toBeInstanceOf(ApiError);
  });
});

describe('work slots (GAP-BILL-13, kernel/gateway/dependencies.py hold_work_slot)', () => {
  const BODY = {
    detail: {
      error: 'concurrent_limit',
      message: 'Your free plan runs 2 jobs at once and all 2 are in use (1 crawl(s) or batch(es), 1 other request(s)). Try again when one finishes.',
      tier: 'free',
      concurrent_limit: 2,
      active_crawls: 1,
      active_requests: 1,
    },
  };

  it('409 concurrent_limit carries activeRequests and the other fields', () => {
    let err: ConcurrencyLimitError | undefined;
    try { raiseForStatus(409, BODY); } catch (e) { err = e as ConcurrencyLimitError; }
    expect(err).toBeInstanceOf(ConcurrencyLimitError);
    expect([err!.statusCode, err!.tier, err!.concurrentLimit, err!.activeCrawls, err!.activeRequests]).toEqual([409, 'free', 2, 1, 1]);
    expect(err!.message).toContain('2 jobs at once');
  });

  it('a 0.5.0-shaped 409 (no active_requests) gives activeRequests null', () => {
    let err: ConcurrencyLimitError | undefined;
    try { raiseForStatus(409, { detail: { error: 'concurrent_limit', message: 'm', concurrent_limit: 10 } }); } catch (e) { err = e as ConcurrencyLimitError; }
    expect(err!.activeRequests).toBeNull();
  });

  it.each([['GET'], ['POST']])('a 409 on %s is not retried', async (method) => {
    const f = mockFetch(BODY, 409);
    const k = new Kloakd({ apiKey: TEST_API_KEY, organizationId: TEST_ORG_ID, fetchImpl: f as unknown as typeof fetch, maxRetries: 3 });
    const call = method === 'GET' ? k.webgrph.getCrawlStatus('c1') : k.kolektr.page('u');
    await expect(call).rejects.toBeInstanceOf(ConcurrencyLimitError);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('crawl orchestrator with an item selector', () => {
  it('extracts with item_selector and keeps every record on the page', async () => {
    const f = mockFetchSequence([
      { body: { crawl_id: 'c1' }, status: 202 },
      { body: { crawl_id: 'c1', status: 'completed', total_pages: 1 } },
      { body: { crawl_id: 'c1', nodes: [{ url: 'https://s/', depth: 0 }], total: 1 } },
      { body: { success: true, url: 'https://s/', status_code: 200, tier_used: 1, html: '<html/>', artifact_id: 'f1', error: null } },
      { body: ITEMS },
    ]);
    const r = await makeClient(f).crawl('https://s/', { extractSchema: { title: 'css:h3 a' }, extractItemSelector: 'article' });
    const extractCall = calls(f).findIndex(([u]) => u.includes('/kolektr/extract'));
    expect(parseCallBody(f, extractCall)['schema_spec']).toEqual({ fields: [{ name: 'title', selector: 'h3 a' }], item_selector: 'article' });
    expect(r.pages[0]!.records).toHaveLength(2);
    expect(r.pages[0]!.structuredData).toEqual(ITEMS.records[0]);
  });

  it('refuses extractItemSelector without extractSchema before crawling', async () => {
    const f = mockFetch({});
    await expect(makeClient(f).crawl('https://s/', { extractItemSelector: 'article' })).rejects.toThrow(/needs extractSchema/);
    expect(f).not.toHaveBeenCalled();
  });
});
