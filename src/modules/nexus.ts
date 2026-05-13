import type { HttpTransport } from '../_http.js';
import type {
  NexusAnalyzeResult,
  NexusExecuteResult,
  NexusKnowledgeResult,
  NexusSynthesisResult,
  NexusVerifyResult,
} from '../models.js';

export class NexusNamespace {
  constructor(private readonly _t: HttpTransport) {}

  async analyze(
    url: string,
    opts: { html?: string; constraints?: Record<string, unknown> } = {},
  ): Promise<NexusAnalyzeResult> {
    const body: Record<string, unknown> = { url };
    if (opts.html) body['html'] = opts.html;
    if (opts.constraints) body['constraints'] = opts.constraints;
    const raw = await this._t.post('nexus/analyze', body);
    const result = {
      perceptionId: (raw['perception_id'] as string | undefined) ?? '',
      strategy: (raw['strategy'] as Record<string, unknown> | undefined) ?? {},
      pageType: (raw['page_type'] as string | undefined) ?? 'unknown',
      complexityLevel: (raw['complexity_level'] as string | undefined) ?? 'unknown',
      artifactId: (raw['artifact_id'] as string | undefined) ?? null,
      durationMs: Number(raw['duration_ms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  async synthesize(
    perceptionId: string,
    opts: { strategy?: Record<string, unknown>; timeout?: number } = {},
  ): Promise<NexusSynthesisResult> {
    const body: Record<string, unknown> = { perception_id: perceptionId };
    if (opts.strategy) body['strategy'] = opts.strategy;
    if (opts.timeout) body['timeout'] = opts.timeout;
    const raw = await this._t.post('nexus/synthesize', body);
    const result = {
      strategyId: (raw['strategy_id'] as string | undefined) ?? '',
      strategyName: (raw['strategy_name'] as string | undefined) ?? '',
      generatedCode: (raw['generated_code'] as string | undefined) ?? '',
      artifactId: (raw['artifact_id'] as string | undefined) ?? null,
      synthesisTimeMs: Number(raw['synthesis_time_ms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  async verify(strategyId: string): Promise<NexusVerifyResult> {
    const raw = await this._t.post('nexus/verify', { strategy_id: strategyId });
    const result = {
      verificationResultId: (raw['verification_result_id'] as string | undefined) ?? '',
      isSafe: Boolean(raw['is_safe']),
      riskScore: Number(raw['risk_score'] ?? 0),
      safetyScore: Number(raw['safety_score'] ?? 0),
      violations: (raw['violations'] as string[] | undefined) ?? [],
      durationMs: Number(raw['duration_ms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.isSafe && result.error === null; } };
  }

  async execute(strategyId: string, url: string): Promise<NexusExecuteResult> {
    const raw = await this._t.post('nexus/execute', { strategy_id: strategyId, url });
    const result = {
      executionResultId: (raw['execution_result_id'] as string | undefined) ?? '',
      success: Boolean(raw['success']),
      records: (raw['data'] as Record<string, unknown>[] | undefined) ?? [],
      artifactId: (raw['artifact_id'] as string | undefined) ?? null,
      durationMs: Number(raw['duration_ms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.success && result.error === null; } };
  }

  async knowledge(
    executionResultId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<NexusKnowledgeResult> {
    const raw = await this._t.post('nexus/knowledge', {
      execution_result_id: executionResultId,
      limit: opts.limit ?? 100,
      offset: opts.offset ?? 0,
    });
    const result = {
      learnedConcepts: (raw['learned_concepts'] as Record<string, unknown>[] | undefined) ?? [],
      learnedPatterns: (raw['learned_patterns'] as Record<string, unknown>[] | undefined) ?? [],
      durationMs: Number(raw['duration_ms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
      hasMore: Boolean(raw['has_more']),
      total: Number(raw['total'] ?? 0),
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  async reason(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post('nexus/reason', context);
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
