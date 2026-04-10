import { makeClient, mockFetch, mockFetchSequence, mockSseFetch, parseCallBody, callUrl } from './helpers.js';

const ENDPOINT = {
  url: 'https://api.example.com/v1/products',
  method: 'GET',
  api_type: 'rest',
  confidence: 0.95,
  parameters: {},
};

const DISCOVER_RESPONSE = {
  success: true,
  discovery_id: 'disc-001',
  url: 'https://api.example.com',
  total_endpoints: 1,
  endpoints: [ENDPOINT],
  artifact_id: 'art-map-001',
  error: null,
  has_more: false,
  total: 1,
};

describe('skanyr.discover', () => {
  it('returns DiscoverResult with ApiEndpoints', async () => {
    const client = makeClient(mockFetch(DISCOVER_RESPONSE));
    const result = await client.skanyr.discover('https://api.example.com');
    expect(result.success).toBe(true);
    expect(result.discoveryId).toBe('disc-001');
    expect(result.artifactId).toBe('art-map-001');
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0]!.url).toBe('https://api.example.com/v1/products');
    expect(result.endpoints[0]!.apiType).toBe('rest');
    expect(result.ok).toBe(true);
  });

  it('passes siteHierarchyArtifactId', async () => {
    const fetch = mockFetch(DISCOVER_RESPONSE);
    const client = makeClient(fetch);
    await client.skanyr.discover('https://api.example.com', { siteHierarchyArtifactId: 'art-hier-001' });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['site_hierarchy_artifact_id']).toBe('art-hier-001');
  });
});

describe('skanyr.discoverAll', () => {
  it('auto-paginates and returns all endpoints', async () => {
    const p1 = { ...DISCOVER_RESPONSE, has_more: true, total: 2, endpoints: [ENDPOINT] };
    const p2 = {
      ...DISCOVER_RESPONSE,
      has_more: false,
      total: 2,
      endpoints: [{ ...ENDPOINT, url: 'https://api.example.com/v1/users' }],
    };
    const client = makeClient(mockFetchSequence([{ body: p1 }, { body: p2 }]));
    const endpoints = await client.skanyr.discoverAll('https://api.example.com');
    expect(endpoints).toHaveLength(2);
    expect(endpoints[1]!.url).toBe('https://api.example.com/v1/users');
  });
});

describe('skanyr.getApiMap', () => {
  it('calls correct path', async () => {
    const fetch = mockFetch({ artifact_id: 'art-001' });
    const client = makeClient(fetch);
    await client.skanyr.getApiMap('art-001');
    const url = callUrl((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(url).toContain('skanyr/api-map/art-001');
  });
});

describe('skanyr.getJob', () => {
  it('calls correct path', async () => {
    const fetch = mockFetch({ job_id: 'job-001', status: 'completed' });
    const client = makeClient(fetch);
    await client.skanyr.getJob('job-001');
    const url = callUrl((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(url).toContain('skanyr/jobs/job-001');
  });
});

describe('skanyr.discoverStream', () => {
  it('yields DiscoverEvent objects', async () => {
    const client = makeClient(mockSseFetch([
      { type: 'endpoint_found', endpoint_url: 'https://api.example.com/v1/products', api_type: 'rest', metadata: {} },
      { type: 'done', endpoint_url: null, api_type: null, metadata: {} },
    ]));
    const events = [];
    for await (const event of client.skanyr.discoverStream('https://api.example.com')) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('endpoint_found');
    expect(events[0]!.endpointUrl).toBe('https://api.example.com/v1/products');
    expect(events[0]!.apiType).toBe('rest');
    expect(events[1]!.type).toBe('done');
  });

  it('passes siteHierarchyArtifactId in SSE body', async () => {
    const fetch = mockSseFetch([{ type: 'done', endpoint_url: null, api_type: null, metadata: {} }]);
    const client = makeClient(fetch);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of client.skanyr.discoverStream('https://api.example.com', { siteHierarchyArtifactId: 'art-hier-001' })) { break; }
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['site_hierarchy_artifact_id']).toBe('art-hier-001');
  });
});
