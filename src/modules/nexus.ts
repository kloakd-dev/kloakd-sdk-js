import type { HttpTransport } from '../_http.js';
import { postFollowingHandoff } from '../_handoff.js';
import type { HandoffOptions } from '../_handoff.js';
import type {
  NexusAnalyzeResult,
  NexusExecuteResult,
  NexusKnowledgeResult,
  NexusSynthesisResult,
  NexusVerifyResult,
} from '../models.js';

function artifactIdOf(raw: Record<string, unknown>): string | null {
  const artifact = raw['artifact'] as Record<string, unknown> | undefined;
  return (artifact?.['artifact_id'] as string | undefined) ?? (raw['artifact_id'] as string | undefined) ?? null;
}

/**
 * NEXUS. `analyze`, `synthesize` and `execute` may run past the API's
 * synchronous limit; the API then hands them off as a job (202) and these
 * methods follow it to the same result (poll options: HandoffOptions).
 */
export class NexusNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /** Analyse a page (its URL and HTML) and propose an extraction strategy. */
  async analyze(
    url: string,
    html: string,
    opts: { constraints?: Record<string, unknown> } & HandoffOptions = {},
  ): Promise<NexusAnalyzeResult> {
    const body: Record<string, unknown> = { url, html };
    if (opts.constraints) body['constraints'] = opts.constraints;
    const raw = await postFollowingHandoff(this._t, 'nexus/analyze', body, opts);
    const result = {
      url: (raw['url'] as string | undefined) ?? url,
      perceptionId: String(raw['perception_id'] ?? ''),
      reasoningId: (raw['reasoning_id'] as string | undefined) ?? null,
      strategy: (raw['strategy'] as Record<string, unknown> | undefined) ?? {},
      pageType: (raw['page_type'] as string | undefined) ?? 'unknown',
      confidence: Number(raw['confidence'] ?? 0),
      artifactId: artifactIdOf(raw),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  /** Generate an extraction program for a page and a goal. */
  async synthesize(url: string, html: string, goal: string, opts: HandoffOptions = {}): Promise<NexusSynthesisResult> {
    const raw = await postFollowingHandoff(this._t, 'nexus/synthesize', { url, html, goal }, opts);
    const result = {
      url: (raw['url'] as string | undefined) ?? url,
      goal: (raw['goal'] as string | undefined) ?? goal,
      strategyId: String(raw['strategy_id'] ?? ''),
      strategyName: String(raw['strategy_name'] ?? ''),
      strategyType: (raw['strategy_type'] as string | undefined) ?? null,
      program: String(raw['program'] ?? ''),
      steps: (raw['steps'] as Record<string, unknown>[] | undefined) ?? [],
      confidence: Number(raw['confidence'] ?? 0),
      synthesisTimeMs: Number(raw['synthesis_time_ms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  async verify(strategyId: string): Promise<NexusVerifyResult> {
    const raw = await this._t.post('nexus/verify', { strategy_id: strategyId });
    const result = {
      strategyId: String(raw['strategy_id'] ?? strategyId),
      verified: Boolean(raw['verified']),
      safetyScore: Number(raw['safety_score'] ?? 0),
      violations: (raw['violations'] as string[] | undefined) ?? [],
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.verified && result.error === null; } };
  }

  /**
   * Execute a verified strategy and return its records. The result's
   * `executionResultId` is the id to pass to `knowledge()`.
   */
  async execute(
    strategyId: string,
    url: string,
    opts: { options?: Record<string, unknown> } & HandoffOptions = {},
  ): Promise<NexusExecuteResult> {
    const body: Record<string, unknown> = { strategy_id: strategyId, url };
    if (opts.options) body['options'] = opts.options;
    const raw = await postFollowingHandoff(this._t, 'nexus/execute', body, opts);
    const result = {
      url: (raw['url'] as string | undefined) ?? url,
      strategyId: String(raw['strategy_id'] ?? strategyId),
      success: Boolean(raw['success']),
      records: (raw['records'] as Record<string, unknown>[] | undefined) ?? [],
      artifactId: artifactIdOf(raw),
      durationMs: Number(raw['duration_ms'] ?? 0),
      executionResultId: (raw['execution_result_id'] as string | undefined) ?? null,
      error: (raw['error_message'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.success && result.error === null; } };
  }

  /**
   * Learn from an execution result (Knowledge Layer). `executionResultId`
   * is `executionResultId` on the result of `execute()` (the API's
   * `execution_result_id`, the same value as that result's `artifactId`).
   */
  async knowledge(executionResultId: string): Promise<NexusKnowledgeResult> {
    const raw = await this._t.post('nexus/knowledge', { execution_result_id: executionResultId });
    const result = {
      executionResultId: String(raw['execution_result_id'] ?? executionResultId),
      learnedConcepts: (raw['learned_concepts'] as Record<string, unknown>[] | undefined) ?? [],
      patterns: (raw['patterns'] as Record<string, unknown>[] | undefined) ?? [],
      totalPatterns: Number(raw['total_patterns'] ?? 0),
      durationMs: Number(raw['duration_ms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  /**
   * Run a reasoning query. `parameters` is a list of strings
   * (modules/nexus/router.py ReasonRequest); the answer is
   * `{success, results: string[], confidence, reasoning_id, …}`.
   */
  async reason(queryType: string, parameters: string[] = [], opts: { perceptionId?: string; timeoutSecs?: number } = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { query_type: queryType, parameters };
    if (opts.perceptionId) body['perception_id'] = opts.perceptionId;
    if (opts.timeoutSecs) body['timeout_secs'] = opts.timeoutSecs;
    return this._t.post('nexus/reason', body);
  }
}
