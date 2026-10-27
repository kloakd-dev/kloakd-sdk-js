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

  it('execute reads records and error_message', async () => {
    const r = await makeClient(mockFetch({ url: 'u', strategy_id: 's1', records: [{ a: 1 }], success: false, error_message: 'timeout' })).nexus.execute('s1', 'u');
    expect(r.records).toEqual([{ a: 1 }]);
    expect(r.error).toBe('timeout');
    expect(r.ok).toBe(false);
  });

  it('execute reads execution_result_id, the id knowledge() takes', async () => {
    const r = await makeClient(mockFetch({ url: 'u', strategy_id: 's1', records: [], success: true, execution_result_id: 'er-7' })).nexus.execute('s1', 'u');
    expect(r.executionResultId).toBe('er-7');
    const without = await makeClient(mockFetch({ url: 'u', strategy_id: 's1', success: true })).nexus.execute('s1', 'u');
    expect(without.executionResultId).toBeNull();
  });

  it('knowledge reads patterns', async () => {
    const r = await makeClient(mockFetch({ execution_result_id: 'e1', learned_concepts: [], patterns: [{ p: 1 }], total_patterns: 1 })).nexus.knowledge('e1');
    expect([r.patterns.length, r.totalPatterns]).toEqual([1, 1]);
  });

  it('reason sends query_type', async () => {
    const fetch = mockFetch({});
    await makeClient(fetch).nexus.reason('page_type', { url: 'u' });
    expect(parseCallBody(first(fetch))).toEqual({ query_type: 'page_type', parameters: { url: 'u' } });
  });
});
