import type { HttpTransport } from '../_http.js';
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

export class NexusNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /** Analyse a page (its URL and HTML) and propose an extraction strategy. */
  async analyze(
    url: string,
    html: string,
    opts: { constraints?: Record<string, unknown> } = {},
  ): Promise<NexusAnalyzeResult> {
    const body: Record<string, unknown> = { url, html };
    if (opts.constraints) body['constraints'] = opts.constraints;
    const raw = await this._t.post('nexus/analyze', body);
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
  async synthesize(url: string, html: string, goal: string): Promise<NexusSynthesisResult> {
    const raw = await this._t.post('nexus/synthesize', { url, html, goal });
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

  async execute(
    strategyId: string,
    url: string,
    opts: { options?: Record<string, unknown> } = {},
  ): Promise<NexusExecuteResult> {
    const body: Record<string, unknown> = { strategy_id: strategyId, url };
    if (opts.options) body['options'] = opts.options;
    const raw = await this._t.post('nexus/execute', body);
    const result = {
      url: (raw['url'] as string | undefined) ?? url,
      strategyId: String(raw['strategy_id'] ?? strategyId),
      success: Boolean(raw['success']),
      records: (raw['records'] as Record<string, unknown>[] | undefined) ?? [],
      artifactId: artifactIdOf(raw),
      durationMs: Number(raw['duration_ms'] ?? 0),
      error: (raw['error_message'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.success && result.error === null; } };
  }

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

  /** Run a reasoning query (`query_type` is required by the API). */
  async reason(queryType: string, parameters: Record<string, unknown> = {}, opts: { perceptionId?: string; timeoutSecs?: number } = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { query_type: queryType, parameters };
    if (opts.perceptionId) body['perception_id'] = opts.perceptionId;
    if (opts.timeoutSecs) body['timeout_secs'] = opts.timeoutSecs;
    return this._t.post('nexus/reason', body);
  }

  async recommendAnalyze(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post('nexus/recommendations/analyze', data);
  }

  async listRecommendationApplications(): Promise<Record<string, unknown>> {
    return this._t.get('nexus/recommendations/applications');
  }

  async getCacheStatistics(): Promise<Record<string, unknown>> { return this._t.get('nexus/recommendations/cache/statistics'); }
  async cleanupCache(): Promise<Record<string, unknown>> { return this._t.post('nexus/recommendations/cache/cleanup', {}); }
  async invalidateCache(): Promise<Record<string, unknown>> { return this._t.post('nexus/recommendations/cache/invalidate', {}); }

  async getHooksStatus(): Promise<Record<string, unknown>> { return this._t.get('nexus/recommendations/hooks/status'); }
  async enableHook(hookName: string): Promise<Record<string, unknown>> { return this._t.post(`nexus/recommendations/hooks/${hookName}/enable`, {}); }
  async disableHook(hookName: string): Promise<Record<string, unknown>> { return this._t.post(`nexus/recommendations/hooks/${hookName}/disable`, {}); }

  async createPreference(preference: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.post('nexus/recommendations/preferences', preference); }
  async getPreferences(userId: string): Promise<Record<string, unknown>> { return this._t.get(`nexus/recommendations/preferences/${userId}`); }
  async updatePreference(preferenceId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> { return this._t.put(`nexus/recommendations/preferences/${preferenceId}`, data); }
  async deletePreference(preferenceId: string): Promise<void> { await this._t.delete(`nexus/recommendations/preferences/${preferenceId}`); }

  async getRecommendationStatistics(): Promise<Record<string, unknown>> { return this._t.get('nexus/recommendations/statistics'); }
}
