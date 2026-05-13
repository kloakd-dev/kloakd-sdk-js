import type { HttpTransport } from '../_http.js';
import type {
  DeduplicationResult,
  FormDetectionResult,
  FetchyrResult,
  MfaDetectionResult,
  MfaResult,
  SessionResult,
  WorkflowExecutionResult,
  WorkflowResult,
} from '../models.js';

export interface LoginOptions {
  submitSelector?: string;
  successUrlContains?: string;
}

export interface FetchyrFetchOptions {
  waitForSelector?: string;
  extractHtml?: boolean;
}

export class FetchyrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  async login(
    url: string,
    usernameSelector: string,
    passwordSelector: string,
    username: string,
    password: string,
    opts: LoginOptions = {},
  ): Promise<SessionResult> {
    const body: Record<string, unknown> = {
      url,
      username_selector: usernameSelector,
      password_selector: passwordSelector,
      username,
      password,
    };
    if (opts.submitSelector) body['submit_selector'] = opts.submitSelector;
    if (opts.successUrlContains) body['success_url_contains'] = opts.successUrlContains;
    const raw = await this._t.post('fetchyr/login', body);
    const result = {
      success: Boolean(raw['success']),
      sessionId: (raw['session_id'] as string | undefined) ?? '',
      url: (raw['url'] as string | undefined) ?? url,
      artifactId: (raw['artifact_id'] as string | undefined) ?? null,
      screenshotUrl: (raw['screenshot_url'] as string | undefined) ?? null,
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.success && result.error === null; } };
  }

  async fetch(
    url: string,
    sessionArtifactId: string,
    opts: FetchyrFetchOptions = {},
  ): Promise<FetchyrResult> {
    const body: Record<string, unknown> = { url, session_artifact_id: sessionArtifactId };
    if (opts.waitForSelector) body['wait_for_selector'] = opts.waitForSelector;
    if (opts.extractHtml !== undefined) body['extract_html'] = opts.extractHtml;
    const raw = await this._t.post('fetchyr/fetch', body);
    const result = {
      success: Boolean(raw['success']),
      url: (raw['url'] as string | undefined) ?? url,
      statusCode: Number(raw['status_code'] ?? 0),
      html: (raw['html'] as string | undefined) ?? null,
      artifactId: (raw['artifact_id'] as string | undefined) ?? null,
      sessionArtifactId,
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.success && result.error === null; } };
  }

  async getSession(artifactId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/sessions/${artifactId}`);
  }

  async invalidateSession(artifactId: string): Promise<void> {
    await this._t.delete(`fetchyr/sessions/${artifactId}`);
  }

  async createWorkflow(
    name: string,
    steps: Record<string, unknown>[],
    url?: string,
  ): Promise<WorkflowResult> {
    const body: Record<string, unknown> = { name, steps };
    if (url) body['url'] = url;
    const raw = await this._t.post('fetchyr/workflows', body);
    const result = {
      workflowId: (raw['workflow_id'] as string | undefined) ?? '',
      name: (raw['name'] as string | undefined) ?? name,
      steps: (raw['steps'] as Record<string, unknown>[] | undefined) ?? steps,
      url: (raw['url'] as string | undefined) ?? null,
      createdAt: (raw['created_at'] as string | undefined) ?? '',
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  async executeWorkflow(workflowId: string): Promise<WorkflowExecutionResult> {
    const raw = await this._t.post(`fetchyr/workflows/${workflowId}/execute`, {});
    return parseExecution(raw);
  }

  async getExecution(workflowId: string, executionId: string): Promise<WorkflowExecutionResult> {
    const raw = await this._t.get(`fetchyr/workflows/${workflowId}/executions/${executionId}`);
    return parseExecution(raw);
  }

  async detectForms(url: string, opts: { sessionArtifactId?: string } = {}): Promise<FormDetectionResult> {
    const body: Record<string, unknown> = { url };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await this._t.post('fetchyr/detect-forms', body);
    return {
      forms: (raw['forms'] as Record<string, unknown>[] | undefined) ?? [],
      totalForms: Number(raw['total_forms'] ?? 0),
      error: (raw['error'] as string | undefined) ?? null,
    };
  }

  async detectMfa(url: string, opts: { sessionArtifactId?: string } = {}): Promise<MfaDetectionResult> {
    const body: Record<string, unknown> = { url };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await this._t.post('fetchyr/detect-mfa', body);
    return {
      mfaDetected: Boolean(raw['mfa_detected']),
      challengeId: (raw['challenge_id'] as string | undefined) ?? null,
      mfaType: (raw['mfa_type'] as string | undefined) ?? null,
      error: (raw['error'] as string | undefined) ?? null,
    };
  }

  async submitMfa(challengeId: string, code: string): Promise<MfaResult> {
    const raw = await this._t.post('fetchyr/submit-mfa', { challenge_id: challengeId, code });
    return {
      success: Boolean(raw['success']),
      sessionArtifactId: (raw['session_artifact_id'] as string | undefined) ?? null,
      error: (raw['error'] as string | undefined) ?? null,
    };
  }

  async storeCredentials(name: string, credentials: Record<string, string>): Promise<Record<string, unknown>> {
    return this._t.post('fetchyr/account/credentials', { name, ...credentials });
  }

  async listCredentials(): Promise<Record<string, unknown>> {
    return this._t.get('fetchyr/account/credentials');
  }

  async deleteCredentials(name: string): Promise<void> {
    await this._t.delete(`fetchyr/account/credentials/${name}`);
  }

  async listSessions(): Promise<Record<string, unknown>> {
    return this._t.get('fetchyr/sessions');
  }

  async terminateSession(artifactId: string): Promise<void> {
    await this._t.delete(`fetchyr/sessions/${artifactId}`);
  }

  async fillForm(url: string, formData: Record<string, string>, opts: { sessionArtifactId?: string; submit?: boolean } = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { url, form_data: formData, submit: opts.submit ?? true };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    return this._t.post('fetchyr/form/fill', body);
  }

  async listMfaChallenges(): Promise<Record<string, unknown>> {
    return this._t.get('fetchyr/mfa-queue');
  }

  async getMfaChallenge(challengeId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/mfa/challenges/${challengeId}`);
  }

  async getMfaStatistics(domain: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/mfa/statistics/${domain}`);
  }

  async listWorkflows(): Promise<Record<string, unknown>> {
    return this._t.get('fetchyr/workflows');
  }

  async getWorkflow(workflowId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/workflows/${workflowId}`);
  }

  async updateWorkflow(workflowId: string, updates: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.patch(`fetchyr/workflows/${workflowId}`, updates);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    await this._t.delete(`fetchyr/workflows/${workflowId}`);
  }

  async getWorkflowStatistics(workflowId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/workflows/${workflowId}/statistics`);
  }

  async createMultiSiteWorkflow(sites: Record<string, unknown>[], name?: string): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { sites };
    if (name) body['name'] = name;
    return this._t.post('fetchyr/multi-site-workflows', body);
  }

  async checkDuplicates(
    records: Record<string, unknown>[],
    opts: { domain?: string } = {},
  ): Promise<DeduplicationResult> {
    const body: Record<string, unknown> = { records };
    if (opts.domain) body['domain'] = opts.domain;
    const raw = await this._t.post('fetchyr/deduplication/check', body);
    const result = {
      uniqueRecords: (raw['unique_records'] as Record<string, unknown>[] | undefined) ?? [],
      duplicateCount: Number(raw['duplicate_count'] ?? 0),
      totalInput: Number(raw['total_input'] ?? records.length),
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.error === null; } };
  }

  async createDedupSession(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post('fetchyr/deduplication/sessions', config);
  }

  async listDedupSessions(): Promise<Record<string, unknown>> {
    return this._t.get('fetchyr/deduplication/sessions/active');
  }

  async getDedupSession(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/sessions/${sessionId}`);
  }

  async getDedupSessionStatistics(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/sessions/${sessionId}/statistics`);
  }

  async getDedupDomainStatistics(domain: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/statistics/${domain}`);
  }
}

function parseExecution(raw: Record<string, unknown>): WorkflowExecutionResult {
  const result = {
    executionId: (raw['execution_id'] as string | undefined) ?? '',
    workflowId: (raw['workflow_id'] as string | undefined) ?? '',
    status: (raw['status'] as string | undefined) ?? 'unknown',
    startedAt: (raw['started_at'] as string | undefined) ?? null,
    completedAt: (raw['completed_at'] as string | undefined) ?? null,
    records: (raw['records'] as Record<string, unknown>[] | undefined) ?? [],
    error: (raw['error'] as string | undefined) ?? null,
  };
  return { ...result, get ok() { return result.status === 'completed' && result.error === null; } };
}
