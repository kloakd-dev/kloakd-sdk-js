/**
 * Cost control, as the cost-control contract (COST-CONTROL-CONTRACT.md,
 * 15 Nov 2026) gives it: the extras and data limit on the job routes and
 * their continue (sections 1-3), the estimate's data and consent fields
 * (section 4), the site map (section 5) and a fetch's stored page
 * (section 8).
 */
import { ApiError, ConcurrencyLimitError, CostAcknowledgementRequiredError, KloakdError } from '../src/index.js';
import { makeClient, mockFetch, mockFetchSequence, ORG_PREFIX } from './helpers.js';

declare const jest: { fn: (impl?: (...args: unknown[]) => unknown) => { mock: { calls: unknown[][] } } };

type Call = [string, RequestInit];
const calls = (f: { mock: { calls: unknown[][] } }) => f.mock.calls as unknown as Call[];
const pathOf = (f: { mock: { calls: unknown[][] } }, i = 0): string => new URL(calls(f)[i]![0]).pathname.slice(ORG_PREFIX.length + 1);
const methodOf = (f: { mock: { calls: unknown[][] } }, i = 0): string => String(calls(f)[i]![1].method);
const rawBody = (f: { mock: { calls: unknown[][] } }, i = 0): unknown => calls(f)[i]![1].body;
const bodyOf = (f: { mock: { calls: unknown[][] } }, i = 0): Record<string, unknown> => JSON.parse(String(rawBody(f, i))) as Record<string, unknown>;

const COST_OPTS = {
  includeResources: ['images', 'fonts'],
  maxDataMb: 40,
  estimateId: 'est.abc',
  costAcknowledged: true,
  urls: ['https://example.com/a', 'https://example.com/b'],
  includePaths: ['/products/'],
};
const COST_BODY = {
  include_resources: ['images', 'fonts'],
  max_data_mb: 40,
  estimate_id: 'est.abc',
  cost_acknowledged: true,
  urls: ['https://example.com/a', 'https://example.com/b'],
  include_paths: ['/products/'],
};
const NEW_KEYS = Object.keys(COST_BODY);

describe('the job routes take the cost-control fields', () => {
  it('startCrawl sends each one given', async () => {
    const f = mockFetch({ crawl_id: 'c1' }, 202);
    await makeClient(f).webgrph.startCrawl('https://example.com/', { maxPages: 10, ...COST_OPTS });
    expect([methodOf(f), pathOf(f)]).toEqual(['POST', 'webgrph/crawl']);
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/', include_external_links: false, max_pages: 10, ...COST_BODY });
  });

  it('startCrawl without them sends none of the new keys (an old call is unchanged)', async () => {
    const f = mockFetch({ crawl_id: 'c1' }, 202);
    await makeClient(f).webgrph.startCrawl('https://example.com/', { maxPages: 10 });
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/', include_external_links: false, max_pages: 10 });
  });

  it('cost_acknowledged false is not sent; an empty extras list is (none loaded)', async () => {
    const f = mockFetch({ crawl_id: 'c1' }, 202);
    await makeClient(f).webgrph.startCrawl('https://example.com/', { costAcknowledged: false, includeResources: [] });
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/', include_external_links: false, include_resources: [] });
  });

  it('crawl (wait false) passes them on', async () => {
    const f = mockFetch({ crawl_id: 'c1' }, 202);
    const r = await makeClient(f).webgrph.crawl('https://example.com/', { wait: false, maxDataMb: 5 });
    expect(bodyOf(f)['max_data_mb']).toBe(5);
    expect(r.crawlId).toBe('c1');
  });

  it('startCrawlExtract sends each one given', async () => {
    const f = mockFetch({ job_id: 'j1', crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.startCrawlExtract('https://example.com/', { extract: { fields: ['price'] }, ...COST_OPTS });
    expect([methodOf(f), pathOf(f)]).toEqual(['POST', 'webgrph/crawl-extract']);
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/', extract: { fields: ['price'] }, ...COST_BODY });
  });

  it('startCrawlExtract without them sends none of the new keys', async () => {
    const f = mockFetch({ job_id: 'j1', crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.startCrawlExtract('https://example.com/', { maxPages: 5 });
    const body = bodyOf(f);
    expect(NEW_KEYS.filter((k) => k in body)).toEqual([]);
    expect(body).toEqual({ url: 'https://example.com/', max_pages: 5 });
  });

  it('"try one page first": crawl-extract with urls of the start page', async () => {
    const f = mockFetch({ job_id: 'j1', crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.startCrawlExtract('https://example.com/', { urls: ['https://example.com/'] });
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/', urls: ['https://example.com/'] });
  });
});

describe('continue with a higher data limit', () => {
  it('continueCrawl sends max_data_mb', async () => {
    const f = mockFetch({ success: true, crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.continueCrawl('c1', { maxDataMb: 100 });
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual(['POST', 'webgrph/crawl/c1/continue', { max_data_mb: 100 }]);
  });

  it('continueCrawlExtract sends it with the other limits', async () => {
    const f = mockFetch({ success: true, job_id: 'j1', crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.continueCrawlExtract('j1', { maxPages: 50, maxDataMb: 80.5 });
    expect(bodyOf(f)).toEqual({ max_pages: 50, max_data_mb: 80.5 });
  });

  it('still sends no body without options', async () => {
    const f = mockFetch({ success: true, crawl_id: 'c1', status: 'queued' }, 202);
    await makeClient(f).webgrph.continueCrawl('c1');
    expect(rawBody(f)).toBeUndefined();
  });
});

/** The contract's estimate example (section 4) on the 14 Nov fields. */
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
  est_gb: 0.012,
  gb_remaining: 4.2,
  will_exhaust_quota: false,
  warning: null,
  explanation: 'A crawl maps the site.',
  include_resources: [],
  data: {
    source: 'site_profile',
    per_page_mb: { typical: 1.2, high: 4.0 },
    total_mb: { low: 3.0, typical: 12.0, high: 40.0 },
    total_mb_all_resources: { typical: 30.0, high: 120.0 },
    saving_mb: { typical: 18.0, high: 80.0 },
    by_category_mb_per_page: { document: 0.3, script: 0.6, data: 0.1, images: 1.1, media: 0.0, fonts: 0.1, stylesheets: 0.08, tracking: 0.05 },
    saving_by_category_mb: { images: 11.0, media: 0.0, fonts: 1.0, stylesheets: 0.8, tracking: 0.5 },
  },
  share_of_remaining: { typical: 0.01, high: 0.04 },
  consent_required: false,
  risks: ['Some sites block automated visitors; a page that cannot be fetched still uses the data received while trying.'],
  suggested_max_data_mb: 40.0,
  estimate_id: 'opaque.signed',
};

describe('the estimate data and consent fields', () => {
  it('estimateCrawl sends include_resources when given, and nothing new when not', async () => {
    const f = mockFetchSequence([{ body: ESTIMATE }, { body: ESTIMATE }]);
    const c = makeClient(f);
    await c.webgrph.estimateCrawl('https://example.com/', { maxPages: 10, includeResources: ['images'] });
    await c.webgrph.estimateCrawl('https://example.com/');
    expect(bodyOf(f, 0)).toEqual({ url: 'https://example.com/', max_pages: 10, include_resources: ['images'] });
    expect(bodyOf(f, 1)).toEqual({ url: 'https://example.com/' });
  });

  it('estimateCrawlExtract sends include_resources', async () => {
    const f = mockFetch({ ...ESTIMATE, mode: 'crawl_extract' });
    await makeClient(f).webgrph.estimateCrawlExtract('https://example.com/', { includeResources: ['media', 'tracking'] });
    expect([pathOf(f), bodyOf(f)]).toEqual(['webgrph/crawl-extract/estimate', { url: 'https://example.com/', include_resources: ['media', 'tracking'] }]);
  });

  it('reads every new field', async () => {
    const r = await makeClient(mockFetch(ESTIMATE)).webgrph.estimateCrawl('https://example.com/');
    expect(r.includeResources).toEqual([]);
    expect(r.data).toEqual({
      source: 'site_profile',
      perPageMb: { low: null, typical: 1.2, high: 4.0 },
      totalMb: { low: 3.0, typical: 12.0, high: 40.0 },
      totalMbAllResources: { low: null, typical: 30.0, high: 120.0 },
      savingMb: { low: null, typical: 18.0, high: 80.0 },
      byCategoryMbPerPage: { document: 0.3, script: 0.6, data: 0.1, images: 1.1, media: 0.0, fonts: 0.1, stylesheets: 0.08, tracking: 0.05 },
      savingByCategoryMb: { images: 11.0, media: 0.0, fonts: 1.0, stylesheets: 0.8, tracking: 0.5 },
    });
    expect(r.shareOfRemaining).toEqual({ low: null, typical: 0.01, high: 0.04 });
    expect([r.consentRequired, r.risks, r.suggestedMaxDataMb, r.estimateId, r.estGb]).toEqual([
      false, ESTIMATE.risks, 40, 'opaque.signed', 0.012,
    ]);
  });

  it('consent required, unknown share, and a data object with parts missing', async () => {
    const r = await makeClient(mockFetch({
      ...ESTIMATE,
      include_resources: ['images'],
      consent_required: true,
      share_of_remaining: null,
      data: { source: 'typical', total_mb: { low: 1, typical: 2, high: 3 } },
    })).webgrph.estimateCrawl('https://example.com/');
    expect([r.consentRequired, r.shareOfRemaining, r.includeResources]).toEqual([true, null, ['images']]);
    expect(r.data!.source).toBe('typical');
    expect(r.data!.perPageMb).toEqual({ low: null, typical: 0, high: 0 });
    expect(r.data!.byCategoryMbPerPage).toEqual({});
  });

  it('start with the estimate: estimate_id, cost_acknowledged and the suggested limit', async () => {
    const f = mockFetchSequence([{ body: { ...ESTIMATE, consent_required: true } }, { body: { crawl_id: 'c1' }, status: 202 }]);
    const c = makeClient(f);
    const est = await c.webgrph.estimateCrawl('https://example.com/');
    await c.webgrph.startCrawl('https://example.com/', {
      estimateId: est.estimateId!, costAcknowledged: est.consentRequired, maxDataMb: est.suggestedMaxDataMb!,
    });
    expect(bodyOf(f, 1)).toMatchObject({ estimate_id: 'opaque.signed', cost_acknowledged: true, max_data_mb: 40 });
  });
});

describe('409 cost_acknowledgement_required', () => {
  it('is a CostAcknowledgementRequiredError', async () => {
    const f = mockFetch({ detail: { error: 'cost_acknowledgement_required', message: 'Acknowledge the estimate first.' } }, 409);
    const err = await makeClient(f).webgrph.startCrawl('https://example.com/').catch((e) => e);
    expect(err).toBeInstanceOf(CostAcknowledgementRequiredError);
    expect(err).toBeInstanceOf(KloakdError);
    expect(err).not.toBeInstanceOf(ConcurrencyLimitError);
    expect([err.statusCode, err.code, err.name]).toEqual([409, 'cost_acknowledgement_required', 'CostAcknowledgementRequiredError']);
  });

  it('is read from the top-level error too', async () => {
    const f = mockFetch({ error: 'cost_acknowledgement_required' }, 409);
    const err = await makeClient(f).webgrph.startCrawlExtract('https://example.com/').catch((e) => e);
    expect(err).toBeInstanceOf(CostAcknowledgementRequiredError);
  });

  it('another 409 is still an ApiError', async () => {
    const f = mockFetch({ error: 'not_resumable' }, 409);
    const err = await makeClient(f).webgrph.continueCrawl('c1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(CostAcknowledgementRequiredError);
  });
});

describe('status data use', () => {
  const PAGES = { nodes: [], next_cursor: null, total: 0 };

  it('a crawl stopped at its data limit', async () => {
    const f = mockFetchSequence([
      {
        body: {
          crawl_id: 'c1', status: 'completed', total_pages: 0, is_partial: true, partial_reason: 'data_limit', resumable: true,
          message: 'Stopped at your data limit of 40 MB. Continue with a higher limit to fetch more.',
          data_used_mb: 40.2, max_data_mb: 40, include_resources: ['images'],
        },
      },
      { body: PAGES },
    ]);
    const r = await makeClient(f).webgrph.waitForCrawl('c1');
    expect([r.partialReason, r.dataUsedMb, r.maxDataMb, r.includeResources]).toEqual(['data_limit', 40.2, 40, ['images']]);
  });

  it('a crawl without them reads null', async () => {
    const f = mockFetchSequence([{ body: { crawl_id: 'c1', status: 'completed', total_pages: 0 } }, { body: PAGES }]);
    const r = await makeClient(f).webgrph.waitForCrawl('c1');
    expect([r.dataUsedMb, r.maxDataMb, r.includeResources]).toEqual([null, null, null]);
  });

  const JOB = {
    job_id: 'j1', crawl_id: 'c1', url: 'https://s/', status: 'completed', cancel_requested: false,
    progress: { pages_crawled: 3, pages_total: null, pages_extracted: 3, pages_failed: 0, items: 9 },
    error: null, error_code: null, request: {}, links: null, pages_by_method: {}, shapes: [],
  };

  it('a crawl-extract job reads them', async () => {
    const r = await makeClient(mockFetch({
      ...JOB, data_used_mb: 12.5, max_data_mb: null, include_resources: [],
      crawl: { status: 'completed', is_partial: true, partial_reason: 'data_limit' },
    })).webgrph.getCrawlExtract('j1');
    expect([r.dataUsedMb, r.maxDataMb, r.includeResources, r.crawl!.partialReason]).toEqual([12.5, null, [], 'data_limit']);
  });

  it('a crawl-extract job without them reads null', async () => {
    const r = await makeClient(mockFetch(JOB)).webgrph.getCrawlExtract('j1');
    expect([r.dataUsedMb, r.maxDataMb, r.includeResources]).toEqual([null, null, null]);
  });
});

const MAP = {
  url: 'https://example.com/',
  source: 'both',
  total_urls: 1234,
  truncated: false,
  data_used_mb: 0.8,
  branches: [
    {
      path: '/products/', url_count: 800, sample_urls: ['https://example.com/products/a'],
      children: [{ path: '/products/shoes/', url_count: 500, sample_urls: [], children: [] }],
    },
    { path: 'other', url_count: 3, sample_urls: ['https://example.com/x'] },
  ],
};

describe('mapSite', () => {
  it('posts the url and max_urls to webgrph/map', async () => {
    const f = mockFetch(MAP);
    await makeClient(f).webgrph.mapSite('https://example.com/', { maxUrls: 5000 });
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual(['POST', 'webgrph/map', { url: 'https://example.com/', max_urls: 5000 }]);
  });

  it('sends only the url without options', async () => {
    const f = mockFetch(MAP);
    await makeClient(f).webgrph.mapSite('https://example.com/');
    expect(bodyOf(f)).toEqual({ url: 'https://example.com/' });
  });

  it('reads the branch tree', async () => {
    const r = await makeClient(mockFetch(MAP)).webgrph.mapSite('https://example.com/');
    expect(r).toEqual({
      url: 'https://example.com/',
      source: 'both',
      totalUrls: 1234,
      truncated: false,
      dataUsedMb: 0.8,
      branches: [
        {
          path: '/products/', urlCount: 800, sampleUrls: ['https://example.com/products/a'],
          children: [{ path: '/products/shoes/', urlCount: 500, sampleUrls: [], children: [] }],
        },
        { path: 'other', urlCount: 3, sampleUrls: ['https://example.com/x'], children: [] },
      ],
    });
  });

  it('an empty answer reads as an empty map of the given url', async () => {
    const r = await makeClient(mockFetch({})).webgrph.mapSite('https://example.com/');
    expect(r).toEqual({ url: 'https://example.com/', source: '', totalUrls: 0, truncated: false, dataUsedMb: 0, branches: [] });
  });
});

const ART_ID = '3f2b8c1e-5a6d-4e7f-9a0b-1c2d3e4f5a6b';

describe('artifacts', () => {
  it('getArtifact reads the metadata the API sends', async () => {
    const f = mockFetch({
      id: ART_ID, type: 'FETCHED_CONTENT', url: 'https://example.com/', created_at: '2026-11-15T01:02:03Z',
      size_bytes: 2048, content_type: 'text/html; charset=utf-8', final_url: 'https://www.example.com/',
      status_code: 200, verified: true, content_url: `${ORG_PREFIX}/artifacts/${ART_ID}/content`,
    });
    const r = await makeClient(f).getArtifact(ART_ID);
    expect([methodOf(f), pathOf(f)]).toEqual(['GET', `artifacts/${ART_ID}`]);
    expect(r).toEqual({
      id: ART_ID, type: 'FETCHED_CONTENT', url: 'https://example.com/', createdAt: '2026-11-15T01:02:03Z',
      sizeBytes: 2048, contentType: 'text/html; charset=utf-8', finalUrl: 'https://www.example.com/',
      statusCode: 200, verified: true, contentUrl: `${ORG_PREFIX}/artifacts/${ART_ID}/content`,
    });
  });

  it('a degraded fetch with no final URL or status', async () => {
    const r = await makeClient(mockFetch({
      id: ART_ID, type: 'DEGRADED_FETCHED_CONTENT', url: 'https://example.com/', created_at: '2026-11-15T01:02:03Z',
      size_bytes: 10, content_type: 'text/html', final_url: null, status_code: null, verified: false,
      content_url: `${ORG_PREFIX}/artifacts/${ART_ID}/content`,
    })).getArtifact(ART_ID);
    expect([r.type, r.finalUrl, r.statusCode, r.verified]).toEqual(['DEGRADED_FETCHED_CONTENT', null, null, false]);
  });

  it('getArtifact encodes the id and reads missing values as null (verified false)', async () => {
    const f = mockFetch({});
    const r = await makeClient(f).getArtifact('a 1');
    expect(pathOf(f)).toBe('artifacts/a%201');
    expect(r).toEqual({
      id: 'a 1', type: '', url: null, createdAt: null, sizeBytes: null, contentType: null,
      finalUrl: null, statusCode: null, verified: false, contentUrl: null,
    });
  });

  it('downloadArtifact returns the content as bytes', async () => {
    const html = '<html><body>hi</body></html>';
    const f = jest.fn(async () => ({
      status: 200,
      ok: true,
      headers: { get: (h: string) => ({ 'content-type': 'text/html; charset=utf-8', 'content-disposition': 'attachment; filename="example.com-3f2b8c1e.html"' } as Record<string, string>)[h.toLowerCase()] ?? null },
      arrayBuffer: async () => new TextEncoder().encode(html).buffer,
      body: undefined,
    }));
    const bytes = await makeClient(f).downloadArtifact(ART_ID);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe(html);
    expect([methodOf(f), pathOf(f), rawBody(f)]).toEqual(['GET', `artifacts/${ART_ID}/content`, undefined]);
  });

  it('an artifact that is not served is the API 404 (session, other org, unknown, no HTML)', async () => {
    const f = mockFetch({ detail: 'Artifact not found' }, 404);
    const err = await makeClient(f).downloadArtifact(ART_ID).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([err.statusCode, err.message]).toEqual([404, 'KLOAKD API error 404: Artifact not found']);
  });

  it('the wrong organisation is the API 403', async () => {
    const f = mockFetch({ detail: 'Forbidden' }, 403);
    const err = await makeClient(f).getArtifact(ART_ID).catch((e) => e);
    expect(err).toBeInstanceOf(KloakdError);
    expect(err.statusCode).toBe(403);
  });

  it('an id that is not a UUID is the API 422', async () => {
    const f = mockFetch({ detail: [{ loc: ['path', 'artifact_id'], msg: 'Input should be a valid UUID', type: 'uuid_parsing' }] }, 422);
    const err = await makeClient(f).getArtifact('not-a-uuid').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(422);
    const err2 = await makeClient(mockFetch({ detail: [{ loc: ['path', 'artifact_id'], msg: 'Input should be a valid UUID', type: 'uuid_parsing' }] }, 422))
      .downloadArtifact('not-a-uuid').catch((e) => e);
    expect([err2 instanceof ApiError, err2.statusCode]).toEqual([true, 422]);
  });
});
