import type { HttpTransport } from '../_http.js';
import type { ChatEvent, ChatTurn, ParseResult } from '../models.js';
import { seg } from '../_params.js';

export class ParlyrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  async parse(message: string, opts: { sessionId?: string } = {}): Promise<ParseResult> {
    const body: Record<string, unknown> = { message };
    if (opts.sessionId) body['session_id'] = opts.sessionId;
    const raw = await this._t.post('parlyr/parse', body);
    const result = {
      intent: (raw['intent'] as string | undefined) ?? 'unknown',
      confidence: Number(raw['confidence'] ?? 0),
      tier: Number(raw['tier'] ?? 0),
      source: (raw['source'] as string | undefined) ?? '',
      entities: (raw['entities'] as Record<string, unknown> | undefined) ?? {},
      requiresAction: Boolean(raw['requires_action']),
      clarificationNeeded: (raw['clarification_needed'] as string | undefined) ?? null,
      reasoning: (raw['reasoning'] as string | undefined) ?? null,
      detectedUrl: (raw['detected_url'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return !result.requiresAction; } };
  }

  /**
   * Send one chat turn and collect its SSE events into a ChatTurn. Resolves
   * when the API sends `end`. `error` events do not throw: they are in
   * `turn.errors` and make `turn.ok` false.
   */
  async chat(sessionId: string, message: string): Promise<ChatTurn> {
    const events: ChatEvent[] = [];
    for await (const event of this.chatStream(sessionId, message)) events.push(event);

    const text: string[] = [];
    let interpretation: Record<string, unknown> | null = null;
    let clarificationNeeded: string | null = null;
    const results: Record<string, unknown>[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const e of events) {
      if ((e.type === 'text' || e.type === 'clarification') && e.content) text.push(e.content);
      if (e.type === 'clarification') clarificationNeeded = e.content;
      if (e.type === 'interpretation') interpretation = e.data;
      if (e.type === 'results' && e.data) results.push(e.data);
      if (e.type === 'error') errors.push(e.content ?? 'error');
      if (e.type === 'warning' && e.content) warnings.push(e.content);
    }
    const intent = interpretation?.['intent'];
    return {
      sessionId,
      response: text.join('\n'),
      intent: typeof intent === 'string' ? intent : null,
      interpretation,
      clarificationNeeded,
      results,
      errors,
      warnings,
      events,
      get ok() { return errors.length === 0; },
    };
  }

  /**
   * The SSE events of one chat turn, as they arrive (the closing `end` is not yielded).
   *
   * @example
   * ```typescript
   * for await (const event of client.parlyr.chatStream('sess-1', 'Scrape example.com')) {
   *   if (event.type === 'text') console.log(event.content);
   * }
   * ```
   */
  async *chatStream(sessionId: string, message: string): AsyncIterable<ChatEvent> {
    for await (const { event, data } of this._t.streamWithEvents('parlyr/chat', {
      session_id: sessionId,
      message,
    })) {
      if (event === 'end') return;
      yield {
        type: typeof data['type'] === 'string' ? (data['type'] as string) : event,
        content: typeof data['content'] === 'string' ? (data['content'] as string) : null,
        data: data['data'] !== null && typeof data['data'] === 'object' ? (data['data'] as Record<string, unknown>) : null,
        actions: Array.isArray(data['actions']) ? (data['actions'] as Record<string, unknown>[]) : null,
        timestamp: typeof data['timestamp'] === 'string' ? (data['timestamp'] as string) : null,
      };
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this._t.delete(`parlyr/chat/${seg(sessionId)}`);
  }
}
