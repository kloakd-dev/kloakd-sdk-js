import { AuthenticationError, RateLimitError } from '../src/errors.js';
import { makeClient, mockFetch, mockFetchError, mockSseFetch, parseCallBody, TEST_API_KEY, TEST_ORG_ID, TEST_BASE_URL } from './helpers.js';

const FETCH_RESPONSE = {
  success: true,
  url: 'https://example.com',
  status_code: 200,
  tier_used: 2,
  html: '<html>content</html>',
  vendor_detected: 'cloudflare',
  anti_bot_bypassed: true,
  artifact_id: 'art-fetch-001',
  error: null,
};

describe('evadr.fetch', () => {
  it('returns FetchResult with correct fields', async () => {
    const client = makeClient(mockFetch(FETCH_RESPONSE));
    const result = await client.evadr.fetch('https://example.com');
    expect(result.success).toBe(true);
    expect(result.url).toBe('https://example.com');
    expect(result.tierUsed).toBe(2);
    expect(result.vendorDetected).toBe('cloudflare');
    expect(result.antiBotBypassed).toBe(true);
    expect(result.artifactId).toBe('art-fetch-001');
    expect(result.html).toBe('<html>content</html>');
    expect(result.ok).toBe(true);
  });

  it('passes forceBrowser and useProxy in request body', async () => {
    const fetch = mockFetch(FETCH_RESPONSE);
    const client = makeClient(fetch);
    await client.evadr.fetch('https://example.com', { forceBrowser: true, useProxy: true });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['force_browser']).toBe(true);
    expect(body['use_proxy']).toBe(true);
  });

  it('passes sessionArtifactId in request body', async () => {
    const fetch = mockFetch(FETCH_RESPONSE);
    const client = makeClient(fetch);
    await client.evadr.fetch('https://example.com', { sessionArtifactId: 'sess-001' });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['session_artifact_id']).toBe('sess-001');
  });

  it('ok is false when success is false', async () => {
    const client = makeClient(mockFetch({ ...FETCH_RESPONSE, success: false, error: 'failed' }));
    const result = await client.evadr.fetch('https://example.com');
    expect(result.ok).toBe(false);
  });

  it('throws AuthenticationError on 401', async () => {
    const client = makeClient(mockFetchError('Invalid key', 401));
    await expect(client.evadr.fetch('https://example.com')).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('throws RateLimitError on 429', async () => {
    const fetchMock = mockFetchError('Rate limited', 429, { retry_after: 30 });
    const client = new (await import('../src/client.js')).Kloakd({
      apiKey: TEST_API_KEY,
      organizationId: TEST_ORG_ID,
      baseUrl: TEST_BASE_URL,
      maxRetries: 0,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(client.evadr.fetch('https://example.com')).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe('evadr.fetchAsync', () => {
  it('returns job_id string', async () => {
    const client = makeClient(mockFetch({ job_id: 'job-001' }));
    const jobId = await client.evadr.fetchAsync('https://example.com');
    expect(jobId).toBe('job-001');
  });
});

describe('evadr.analyze', () => {
  it('returns AnalyzeResult', async () => {
    const client = makeClient(mockFetch({
      blocked: true,
      vendor: 'cloudflare',
      confidence: 0.95,
      recommended_actions: ['use_proxy', 'stealth_browser'],
    }));
    const result = await client.evadr.analyze('https://example.com', { statusCode: 403 });
    expect(result.blocked).toBe(true);
    expect(result.vendor).toBe('cloudflare');
    expect(result.confidence).toBe(0.95);
    expect(result.recommendedActions).toEqual(['use_proxy', 'stealth_browser']);
  });
});

describe('evadr.storeProxy', () => {
  it('sends name and proxy_url', async () => {
    const fetch = mockFetch({});
    const client = makeClient(fetch);
    await client.evadr.storeProxy('my-proxy', 'http://proxy.example.com:8080');
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['name']).toBe('my-proxy');
    expect(body['proxy_url']).toBe('http://proxy.example.com:8080');
  });
});

describe('evadr.fetchStream', () => {
  it('yields FetchEvent objects from SSE stream', async () => {
    const client = makeClient(mockSseFetch([
      { type: 'tier_start', tier: 1, vendor: null, metadata: {} },
      { type: 'tier_complete', tier: 1, vendor: 'cloudflare', metadata: { bypassed: true } },
      { type: 'done', tier: 1, vendor: 'cloudflare', metadata: {} },
    ]));
    const events = [];
    for await (const event of client.evadr.fetchStream('https://example.com')) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
    expect(events[0]!.type).toBe('tier_start');
    expect(events[1]!.vendor).toBe('cloudflare');
    expect(events[2]!.type).toBe('done');
  });

  it('passes forceBrowser in SSE request body', async () => {
    const fetch = mockSseFetch([{ type: 'done', tier: 1, vendor: null, metadata: {} }]);
    const client = makeClient(fetch);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of client.evadr.fetchStream('https://example.com', { forceBrowser: true })) { break; }
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['force_browser']).toBe(true);
  });
});
