import { makeClient, mockFetch, parseCallBody } from './helpers.js';

type Calls = { mock: { calls: unknown[][] } };
const first = (f: unknown) => (f as Calls).mock.calls[0]!;

describe('nexus', () => {
  it('analyze sends the url and html and reads the analysis', async () => {
    const fetch = mockFetch({ url: 'https://e.com', page_type: 'listing', confidence: 0.9, strategy: { s: 1 }, perception_id: 'p1', artifact: { artifact_id: 'a1' } });
    const r = await makeClient(fetch).nexus.analyze('https://e.com', '<html></html>', { constraints: { max_fields: 3 } });
    expect(parseCallBody(first(fetch))).toEqual({ url: 'https://e.com', html: '<html></html>', constraints: { max_fields: 3 } });
    expect([r.pageType, r.confidence, r.perceptionId, r.artifactId, r.ok]).toEqual(['listing', 0.9, 'p1', 'a1', true]);
  });

  it('synthesize sends url, html and goal', async () => {
    const fetch = mockFetch({ url: 'u', goal: 'g', program: 'code', strategy_id: 's1', strategy_name: 'n', synthesis_time_ms: 12 });
    const r = await makeClient(fetch).nexus.synthesize('u', '<html/>', 'g');
    expect(parseCallBody(first(fetch))).toEqual({ url: 'u', html: '<html/>', goal: 'g' });
    expect([r.program, r.strategyId, r.synthesisTimeMs]).toEqual(['code', 's1', 12]);
  });

  it('verify reads verified and the safety score', async () => {
    const r = await makeClient(mockFetch({ strategy_id: 's1', verified: true, violations: [], safety_score: 0.97 })).nexus.verify('s1');
    expect([r.verified, r.safetyScore, r.ok]).toEqual([true, 0.97, true]);
  });

  it('verify reads status, the safety checks and the risk score (nexus/router.py VerifyResponse)', async () => {
    const r = await makeClient(mockFetch({
      strategy_id: 's1', verified: false, status: 'unsafe', violations: ['no_destructive_actions'], safety_score: 0.2,
      risk_score: 0.8, verification_result_id: 'v-1', duration_ms: 14,
      safety_checks: [{ property: 'no_destructive_actions', passed: false, details: 'clicks a delete button' }, { property: 'bounded', passed: true }],
    })).nexus.verify('s1');
    expect([r.verified, r.ok, r.status, r.riskScore, r.verificationResultId, r.durationMs]).toEqual([false, false, 'unsafe', 0.8, 'v-1', 14]);
    expect(r.violations).toEqual(['no_destructive_actions']);
    expect(r.safetyChecks).toEqual([
      { property: 'no_destructive_actions', passed: false, details: 'clicks a delete button' },
      { property: 'bounded', passed: true, details: '' },
    ]);
    const bare = await makeClient(mockFetch({ strategy_id: 's1', verified: true })).nexus.verify('s1');
    expect([bare.status, bare.safetyChecks, bare.riskScore, bare.verificationResultId]).toEqual([null, [], 0, null]);
  });

  it('has no execute (the API removed nexus/execute) and no knowledge (not in the public API)', () => {
    const nexus = makeClient(mockFetch({})).nexus as unknown as Record<string, unknown>;
    expect(nexus['execute']).toBeUndefined();
    expect(nexus['knowledge']).toBeUndefined();
  });

  it('reason sends query_type and parameters as a list of strings (nexus/router.py ReasonRequest)', async () => {
    const fetch = mockFetch({});
    await makeClient(fetch).nexus.reason('page_type', ['u', 'v']);
    expect(parseCallBody(first(fetch))).toEqual({ query_type: 'page_type', parameters: ['u', 'v'] });
    const fetch2 = mockFetch({});
    await makeClient(fetch2).nexus.reason('page_type');
    expect(parseCallBody(first(fetch2))).toEqual({ query_type: 'page_type', parameters: [] });
  });
});
