import { makeClient, mockFetch, mockSseFetch, mockSseEventFetch, parseCallBody, callUrl } from './helpers.js';

describe('parlyr.parse', () => {
  it('returns ParseResult', async () => {
    const client = makeClient(mockFetch({
      intent: 'scrape_products',
      confidence: 0.95,
      tier: 1,
      source: 'pattern_db',
      entities: { url: 'https://example.com' },
      requires_action: false,
      clarification_needed: null,
      reasoning: null,
      detected_url: 'https://example.com',
    }));
    const result = await client.parlyr.parse('Scrape all products from example.com');
    expect(result.intent).toBe('scrape_products');
    expect(result.confidence).toBe(0.95);
    expect(result.tier).toBe(1);
    expect(result.detectedUrl).toBe('https://example.com');
    expect(result.requiresAction).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('ok is false when requiresAction is true', async () => {
    const client = makeClient(mockFetch({
      intent: 'clarify',
      confidence: 0.4,
      tier: 3,
      source: 'llm',
      entities: {},
      requires_action: true,
      clarification_needed: 'Please specify the target URL.',
      reasoning: null,
      detected_url: null,
    }));
    const result = await client.parlyr.parse('scrape the thing');
    expect(result.ok).toBe(false);
    expect(result.clarificationNeeded).toBe('Please specify the target URL.');
  });

  it('passes sessionId', async () => {
    const fetch = mockFetch({ intent: 'scrape', confidence: 0.9, tier: 1, source: '', entities: {}, requires_action: false, clarification_needed: null, reasoning: null, detected_url: null });
    const client = makeClient(fetch);
    await client.parlyr.parse('hello', { sessionId: 'sess-abc' });
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['session_id']).toBe('sess-abc');
  });
});

describe('parlyr.chat', () => {
  it('collects SSE events into ChatTurn', async () => {
    const client = makeClient(mockSseEventFetch([
      { event: 'intent', data: { intent: 'scrape_products', confidence: 0.92, tier: 1, entities: { url: 'example.com' }, requires_action: false } },
      { event: 'response', data: { content: 'I will scrape example.com for you.' } },
      { event: 'done', data: {} },
    ]));
    const turn = await client.parlyr.chat('sess-001', 'Scrape example.com');
    expect(turn.sessionId).toBe('sess-001');
    expect(turn.intent).toBe('scrape_products');
    expect(turn.confidence).toBe(0.92);
    expect(turn.response).toBe('I will scrape example.com for you.');
    expect(turn.requiresAction).toBe(false);
  });

  it('uses safe defaults when no intent event arrives', async () => {
    const client = makeClient(mockSseEventFetch([
      { event: 'response', data: { content: 'Here you go.' } },
    ]));
    const turn = await client.parlyr.chat('sess-002', 'hello');
    expect(turn.intent).toBe('unknown');
    expect(turn.confidence).toBe(0);
    expect(turn.response).toBe('Here you go.');
  });

  it('sends session_id and message in payload', async () => {
    const fetch = mockSseEventFetch([{ event: 'done', data: {} }]);
    const client = makeClient(fetch);
    await client.parlyr.chat('my-session', 'my message');
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['session_id']).toBe('my-session');
    expect(body['message']).toBe('my message');
  });
});

describe('parlyr.chatStream', () => {
  it('yields ChatEvent objects', async () => {
    const client = makeClient(mockSseEventFetch([
      { event: 'intent', data: { intent: 'scrape_products', confidence: 0.9 } },
      { event: 'response', data: { content: 'Scraping...' } },
      { event: 'done', data: {} },
    ]));
    const events = [];
    for await (const event of client.parlyr.chatStream('sess-001', 'hello')) {
      events.push(event);
    }
    expect(events).toHaveLength(3);
    expect(events[0]!.event).toBe('intent');
    expect(events[1]!.event).toBe('response');
    expect(events[2]!.event).toBe('done');
  });
});

describe('parlyr.deleteSession', () => {
  it('calls DELETE on correct path', async () => {
    const fetch = mockFetch({}, 204);
    const client = makeClient(fetch);
    await client.parlyr.deleteSession('sess-xyz');
    const calls = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(callUrl(calls)).toContain('parlyr/chat/sess-xyz');
    expect((calls[1] as { method: string }).method).toBe('DELETE');
  });
});
