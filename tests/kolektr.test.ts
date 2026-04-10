import { makeClient, mockFetch, mockFetchSequence, parseCallBody } from './helpers.js';

const EXTRACTION_RESPONSE = {
  success: true,
  url: 'https://books.toscrape.com',
  method: 'l1_css',
  records: [
    { title: 'A Light in the Attic', price: '£51.77' },
    { title: 'Tipping the Velvet', price: '£53.74' },
  ],
  total_records: 2,
  pages_scraped: 1,
  artifact_id: 'art-data-001',
  job_id: null,
  error: null,
  has_more: false,
  total: 2,
};

describe('kolektr.page', () => {
  it('returns ExtractionResult with records', async () => {
    const client = makeClient(mockFetch(EXTRACTION_RESPONSE));
    const result = await client.kolektr.page('https://books.toscrape.com', {
      schema: { title: 'css:h3 a', price: 'css:p.price_color' },
    });
    expect(result.success).toBe(true);
    expect(result.method).toBe('l1_css');
    expect(result.records).toHaveLength(2);
    expect(result.artifactId).toBe('art-data-001');
    expect(result.ok).toBe(true);
    expect(result.hasMore).toBe(false);
  });

  it('passes fetchArtifactId for artifact chaining', async () => {
    const fetch = mockFetch(EXTRACTION_RESPONSE);
    const client = makeClient(fetch);
    await client.kolektr.page('https://books.toscrape.com', { fetchArtifactId: 'art-fetch-001' });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['fetch_artifact_id']).toBe('art-fetch-001');
  });

  it('passes sessionArtifactId', async () => {
    const fetch = mockFetch(EXTRACTION_RESPONSE);
    const client = makeClient(fetch);
    await client.kolektr.page('https://books.toscrape.com', { sessionArtifactId: 'sess-001' });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['session_artifact_id']).toBe('sess-001');
  });

  it('passes apiMapArtifactId', async () => {
    const fetch = mockFetch(EXTRACTION_RESPONSE);
    const client = makeClient(fetch);
    await client.kolektr.page('https://books.toscrape.com', { apiMapArtifactId: 'art-map-001' });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['api_map_artifact_id']).toBe('art-map-001');
  });
});

describe('kolektr.pageAll', () => {
  it('auto-paginates until hasMore is false', async () => {
    const p1 = { ...EXTRACTION_RESPONSE, has_more: true, total: 4, records: [{ title: 'Book 1' }, { title: 'Book 2' }] };
    const p2 = { ...EXTRACTION_RESPONSE, has_more: false, total: 4, records: [{ title: 'Book 3' }, { title: 'Book 4' }] };
    const client = makeClient(mockFetchSequence([{ body: p1 }, { body: p2 }]));
    const records = await client.kolektr.pageAll('https://books.toscrape.com');
    expect(records).toHaveLength(4);
    expect((records[2] as { title: string }).title).toBe('Book 3');
  });
});

describe('kolektr.extractHtml', () => {
  it('sends html and url in body', async () => {
    const fetch = mockFetch({ ...EXTRACTION_RESPONSE, method: 'l1_css' });
    const client = makeClient(fetch);
    await client.kolektr.extractHtml('<html>...</html>', 'https://example.com', {
      schema: { title: 'css:h1' },
    });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['html']).toBe('<html>...</html>');
    expect(body['url']).toBe('https://example.com');
    expect(body['schema']).toEqual({ title: 'css:h1' });
  });

  it('returns ExtractionResult', async () => {
    const client = makeClient(mockFetch(EXTRACTION_RESPONSE));
    const result = await client.kolektr.extractHtml('<html/>', 'https://example.com');
    expect(result.success).toBe(true);
    expect(result.ok).toBe(true);
  });
});
