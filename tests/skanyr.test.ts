import { callUrl, makeClient, mockFetch, ORG_PREFIX, parseCallBody } from './helpers.js';

type Calls = { mock: { calls: unknown[][] } };
const first = (f: unknown) => (f as Calls).mock.calls[0]!;

describe('skanyr', () => {
  it('builds a site from a crawl', async () => {
    const fetch = mockFetch({ id: 'site-1' });
    const site = await makeClient(fetch).skanyr.siteFromCrawl('crawl-1');
    expect(site['id']).toBe('site-1');
    expect(callUrl(first(fetch))).toBe(`https://api.kloakd.dev${ORG_PREFIX}/skanyr/sites/from-crawl/crawl-1`);
  });

  it('searches stored content with the API fields', async () => {
    const fetch = mockFetch({ results: [] });
    await makeClient(fetch).skanyr.search('pricing', { siteId: 'site-1', limit: 5 });
    expect(parseCallBody(first(fetch))).toEqual({ query: 'pricing', site_id: 'site-1', limit: 5 });
  });

  it('searches one site with q as a query parameter', async () => {
    const fetch = mockFetch({ results: [] });
    await makeClient(fetch).skanyr.searchSite('site-1', 'api docs', { limit: 3 });
    expect(callUrl(first(fetch))).toContain('/skanyr/sites/site-1/search?q=api+docs&limit=3');
  });

  it('syncs a site', async () => {
    const fetch = mockFetch({ fetched: 2 });
    await makeClient(fetch).skanyr.sync('site-1', { urls: ['https://example.com/a'], policy: 'changed' });
    expect(parseCallBody(first(fetch))).toEqual({ site_id: 'site-1', urls: ['https://example.com/a'], policy: 'changed' });
  });
});
