import { makeClient, mockFetch, mockSseEventFetch, parseCallBody, callUrl } from './helpers.js';

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

/** The API's chat events (application/services/chat_orchestrator.py ChatEvent.to_json). */
const ev = (type: string, content: string | null, data: Record<string, unknown> | null = null, actions: unknown = null) => ({
  event: type,
  data: { type, content, data, actions, timestamp: '2026-10-28T00:00:00' },
});

describe('parlyr.chat', () => {
  it('builds the turn from text, clarification, interpretation and results events', async () => {
    const client = makeClient(mockSseEventFetch([
      ev('thinking', 'Understanding context...', { stage: 'llm_reasoning', tier: 3 }),
      ev('interpretation', 'I will extract products from example.com.', { url: 'https://example.com', entity: 'products', summary: 'Extract products' },
        [{ id: 'start', label: 'Start' }]),
      ev('progress', 'Fetching', { pct: 50 }),
      ev('results', 'Extracted 2 items', { items: [{ a: 1 }, { a: 2 }], count: 2, job_id: 'j-1' }),
      ev('warning', 'Slow site'),
      ev('text', 'Done.'),
      { event: 'end', data: {} },
    ]));
    const turn = await client.parlyr.chat('sess-001', 'Scrape example.com');
    expect(turn.sessionId).toBe('sess-001');
    expect(turn.response).toBe('Done.');
    expect(turn.interpretation).toEqual({ url: 'https://example.com', entity: 'products', summary: 'Extract products' });
    expect(turn.intent).toBeNull(); // the API's interpretation data has no intent key
    expect(turn.results).toEqual([{ items: [{ a: 1 }, { a: 2 }], count: 2, job_id: 'j-1' }]);
    expect(turn.warnings).toEqual(['Slow site']);
    expect(turn.events.map((e) => e.type)).toEqual(['thinking', 'interpretation', 'progress', 'results', 'warning', 'text']);
    expect(turn.events[1]!.actions).toEqual([{ id: 'start', label: 'Start' }]);
    expect(turn.ok).toBe(true);
  });

  it('joins text and clarification content and reads intent when interpretation data has one', async () => {
    const client = makeClient(mockSseEventFetch([
      ev('interpretation', 'x', { intent: 'scrape' }),
      ev('text', 'First.'),
      ev('clarification', 'Which page?', { confidence: 0.4 }),
      { event: 'end', data: {} },
    ]));
    const turn = await client.parlyr.chat('s', 'm');
    expect(turn.response).toBe('First.\nWhich page?');
    expect(turn.clarificationNeeded).toBe('Which page?');
    expect(turn.intent).toBe('scrape');
  });

  it('surfaces error events: errors and ok false', async () => {
    const client = makeClient(mockSseEventFetch([ev('error', 'Scrape failed'), { event: 'end', data: {} }]));
    const turn = await client.parlyr.chat('s', 'm');
    expect(turn.errors).toEqual(['Scrape failed']);
    expect(turn.ok).toBe(false);
  });

  it('sends session_id and message in payload', async () => {
    const fetch = mockSseEventFetch([{ event: 'end', data: {} }]);
    const client = makeClient(fetch);
    await client.parlyr.chat('my-session', 'my message');
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['session_id']).toBe('my-session');
    expect(body['message']).toBe('my message');
  });
});

describe('parlyr.chatStream', () => {
  it('yields the real event fields and stops at end', async () => {
    const client = makeClient(mockSseEventFetch([
      ev('thinking', 'Hmm', { tier: 3 }),
      ev('text', 'Hello'),
      { event: 'end', data: {} },
    ]));
    const events = [];
    for await (const event of client.parlyr.chatStream('sess-001', 'hello')) events.push(event);
    expect(events).toEqual([
      { type: 'thinking', content: 'Hmm', data: { tier: 3 }, actions: null, timestamp: '2026-10-28T00:00:00' },
      { type: 'text', content: 'Hello', data: null, actions: null, timestamp: '2026-10-28T00:00:00' },
    ]);
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
