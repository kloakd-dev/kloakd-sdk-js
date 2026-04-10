import { makeClient, mockFetch, parseCallBody } from './helpers.js';

describe('nexus.analyze', () => {
  it('returns NexusAnalyzeResult', async () => {
    const client = makeClient(mockFetch({
      perception_id: 'perc-001',
      strategy: { name: 'css_scrape' },
      page_type: 'listing',
      complexity_level: 'low',
      artifact_id: 'art-001',
      duration_ms: 120,
      error: null,
    }));
    const result = await client.nexus.analyze('https://example.com');
    expect(result.perceptionId).toBe('perc-001');
    expect(result.pageType).toBe('listing');
    expect(result.complexityLevel).toBe('low');
    expect(result.artifactId).toBe('art-001');
    expect(result.durationMs).toBe(120);
    expect(result.ok).toBe(true);
  });

  it('passes html and constraints', async () => {
    const fetch = mockFetch({ perception_id: 'p', strategy: {}, page_type: 'detail', complexity_level: 'medium', artifact_id: null, duration_ms: 0, error: null });
    const client = makeClient(fetch);
    await client.nexus.analyze('https://example.com', { html: '<html/>', constraints: { max_fields: 5 } });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['html']).toBe('<html/>');
    expect(body['constraints']).toEqual({ max_fields: 5 });
  });
});

describe('nexus.synthesize', () => {
  it('returns NexusSynthesisResult', async () => {
    const client = makeClient(mockFetch({
      strategy_id: 'strat-001',
      strategy_name: 'ProductListingCSSStrategy',
      generated_code: 'document.querySelectorAll(...)',
      artifact_id: 'art-002',
      synthesis_time_ms: 340,
      error: null,
    }));
    const result = await client.nexus.synthesize('perc-001');
    expect(result.strategyId).toBe('strat-001');
    expect(result.strategyName).toBe('ProductListingCSSStrategy');
    expect(result.synthesisTimeMs).toBe(340);
    expect(result.ok).toBe(true);
  });
});

describe('nexus.verify', () => {
  it('returns NexusVerifyResult', async () => {
    const client = makeClient(mockFetch({
      verification_result_id: 'ver-001',
      is_safe: true,
      risk_score: 0.05,
      safety_score: 0.95,
      violations: [],
      duration_ms: 80,
      error: null,
    }));
    const result = await client.nexus.verify('strat-001');
    expect(result.verificationResultId).toBe('ver-001');
    expect(result.isSafe).toBe(true);
    expect(result.riskScore).toBe(0.05);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('ok is false when isSafe is false', async () => {
    const client = makeClient(mockFetch({
      verification_result_id: 'ver-002',
      is_safe: false,
      risk_score: 0.9,
      safety_score: 0.1,
      violations: ['rate_limit_risk'],
      duration_ms: 50,
      error: null,
    }));
    const result = await client.nexus.verify('strat-002');
    expect(result.ok).toBe(false);
  });
});

describe('nexus.execute', () => {
  it('returns NexusExecuteResult', async () => {
    const client = makeClient(mockFetch({
      execution_result_id: 'exec-001',
      success: true,
      data: [{ title: 'Product A', price: '9.99' }],
      artifact_id: 'art-003',
      duration_ms: 2100,
      error: null,
    }));
    const result = await client.nexus.execute('strat-001', 'https://example.com');
    expect(result.executionResultId).toBe('exec-001');
    expect(result.success).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.ok).toBe(true);
  });
});

describe('nexus.knowledge', () => {
  it('returns NexusKnowledgeResult with pagination', async () => {
    const client = makeClient(mockFetch({
      learned_concepts: [{ name: 'product_grid' }],
      learned_patterns: [{ selector: 'div.product' }],
      duration_ms: 50,
      error: null,
      has_more: false,
      total: 1,
    }));
    const result = await client.nexus.knowledge('exec-001');
    expect(result.learnedConcepts).toHaveLength(1);
    expect(result.learnedPatterns).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.ok).toBe(true);
  });
});
