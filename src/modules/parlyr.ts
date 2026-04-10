import type { HttpTransport } from '../_http.js';
import type { ChatEvent, ChatTurn, ParseResult } from '../models.js';

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
   * Send one chat turn and collect all SSE events into a ChatTurn.
   * Blocks until the `done` event is received.
   */
  async chat(sessionId: string, message: string): Promise<ChatTurn> {
    let intentData: Record<string, unknown> = {};
    let responseText = '';

    for await (const { event, data } of this._t.streamWithEvents('parlyr/chat', {
      session_id: sessionId,
      message,
    })) {
      if (event === 'intent') intentData = data;
      else if (event === 'response') responseText = (data['content'] as string | undefined) ?? '';
    }

    return {
      sessionId,
      intent: (intentData['intent'] as string | undefined) ?? 'unknown',
      confidence: Number(intentData['confidence'] ?? 0),
      tier: Number(intentData['tier'] ?? 0),
      response: responseText,
      entities: (intentData['entities'] as Record<string, unknown> | undefined) ?? {},
      requiresAction: Boolean(intentData['requires_action']),
      clarificationNeeded: (intentData['clarification_needed'] as string | undefined) ?? null,
    };
  }

  /**
   * Async iterable SSE stream for one chat turn.
   *
   * @example
   * ```typescript
   * for await (const event of client.parlyr.chatStream('sess-1', 'Scrape linkedin.com')) {
   *   console.log(event.event, event.data);
   * }
   * ```
   */
  async *chatStream(sessionId: string, message: string): AsyncIterable<ChatEvent> {
    for await (const { event, data } of this._t.streamWithEvents('parlyr/chat', {
      session_id: sessionId,
      message,
    })) {
      yield { event, data };
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this._t.delete(`parlyr/chat/${sessionId}`);
  }
}
