import { Kloakd } from '../src/client.js';
import { TEST_API_KEY, TEST_ORG_ID, TEST_BASE_URL, makeClient, mockFetch, parseCallBody } from './helpers.js';

describe('Kloakd client', () => {
  it('constructs with required options', () => {
    const client = new Kloakd({ apiKey: TEST_API_KEY, organizationId: TEST_ORG_ID });
    expect(client.toString()).toContain(TEST_ORG_ID);
  });

  it('throws when apiKey is missing', () => {
    expect(() => new Kloakd({ apiKey: '', organizationId: TEST_ORG_ID })).toThrow('apiKey is required');
  });

  it('throws when organizationId is missing', () => {
    expect(() => new Kloakd({ apiKey: TEST_API_KEY, organizationId: '' })).toThrow('organizationId is required');
  });

  it('exposes all 7 namespace properties', () => {
    const client = makeClient(mockFetch({}));
    expect(client.evadr).toBeDefined();
    expect(client.webgrph).toBeDefined();
    expect(client.skanyr).toBeDefined();
    expect(client.nexus).toBeDefined();
    expect(client.parlyr).toBeDefined();
    expect(client.fetchyr).toBeDefined();
    expect(client.kolektr).toBeDefined();
  });

  it('uses custom baseUrl', () => {
    const client = new Kloakd({
      apiKey: TEST_API_KEY,
      organizationId: TEST_ORG_ID,
      baseUrl: 'https://custom.kloakd.dev',
    });
    expect(client.toString()).toContain('custom.kloakd.dev');
  });
});

describe('HttpTransport auth headers', () => {
  it('sends Authorization, X-Kloakd-Organization, X-Kloakd-SDK headers', async () => {
    const fetch = mockFetch({ success: true, url: 'https://example.com', status_code: 200,
      tier_used: 1, html: null, vendor_detected: null, anti_bot_bypassed: false,
      artifact_id: null, error: null });
    const client = makeClient(fetch);
    await client.evadr.fetch('https://example.com');
    const callArgs = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    const headers = (callArgs[1] as { headers: Record<string, string> }).headers;
    expect(headers['Authorization']).toBe(`Bearer ${TEST_API_KEY}`);
    expect(headers['X-Kloakd-Organization']).toBe(TEST_ORG_ID);
    expect(headers['X-Kloakd-SDK']).toMatch(/^typescript\//);
  });
});
