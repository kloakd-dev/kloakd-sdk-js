import type { HttpTransport } from '../_http.js';
import type {
  DuplicateCheckResult,
  FormDetectionResult,
  MfaChallenge,
  MfaDetectionResult,
  SessionResult,
  WorkflowExecutionResult,
  WorkflowResult,
} from '../models.js';

function parseWorkflow(raw: Record<string, unknown>, name = ''): WorkflowResult {
  const result = {
    workflowId: String(raw['id'] ?? raw['workflow_id'] ?? ''),
    name: (raw['name'] as string | undefined) ?? name,
    description: (raw['description'] as string | undefined) ?? null,
    workflowType: (raw['workflow_type'] as string | undefined) ?? null,
    steps: (raw['steps'] as Record<string, unknown>[] | undefined) ?? [],
    isActive: Boolean(raw['is_active'] ?? true),
    createdAt: String(raw['created_at'] ?? ''),
    error: (raw['error'] as string | undefined) ?? null,
  };
  return { ...result, get ok() { return result.error === null; } };
}

function parseExecution(raw: Record<string, unknown>): WorkflowExecutionResult {
  const result = {
    executionId: String(raw['execution_id'] ?? ''),
    workflowId: String(raw['workflow_id'] ?? ''),
    status: (raw['status'] as string | undefined) ?? 'unknown',
    startedAt: (raw['started_at'] as string | undefined) ?? null,
    completedAt: (raw['completed_at'] as string | undefined) ?? null,
    result: (raw['result'] as Record<string, unknown> | undefined) ?? null,
    error: (raw['error'] as string | undefined) ?? null,
  };
  return { ...result, get ok() { return result.status === 'completed' && result.error === null; } };
}

function parseChallenge(raw: Record<string, unknown>): MfaChallenge {
  return {
    id: String(raw['id'] ?? ''),
    sessionId: (raw['session_id'] as string | undefined) ?? null,
    mfaType: (raw['mfa_type'] as string | undefined) ?? null,
    status: String(raw['status'] ?? ''),
    challengeData: (raw['challenge_data'] as Record<string, unknown> | undefined) ?? {},
    expiresAt: (raw['expires_at'] as string | undefined) ?? null,
    createdAt: (raw['created_at'] as string | undefined) ?? null,
  };
}

export class FetchyrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /**
   * Log in to a site with credentials stored under `credentialName`
   * (see storeCredentials); produces an authenticated session artifact.
   */
  async authenticate(credentialName: string, targetUrl: string): Promise<SessionResult> {
    const raw = await this._t.post('fetchyr/authenticate', {
      credential_name: credentialName,
      target_url: targetUrl,
    });
    const result = {
      success: Boolean(raw['success']),
      sessionId: String(raw['session_id'] ?? ''),
      url: targetUrl,
      artifactId: (raw['artifact_id'] as string | undefined) ?? null,
      targetDomain: (raw['target_domain'] as string | undefined) ?? null,
      authMethod: (raw['auth_method'] as string | undefined) ?? null,
      error: (raw['error'] as string | undefined) ?? null,
    };
    return { ...result, get ok() { return result.success && result.error === null; } };
  }

  /** Store login credentials (encrypted server-side) for authenticate(). */
  async storeCredentials(
    name: string,
    credentials: { username: string; password: string; extra?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { name, username: credentials.username, password: credentials.password };
    if (credentials.extra) body['extra'] = credentials.extra;
    return this._t.post('fetchyr/account/credentials', body);
  }

  async listCredentials(): Promise<Record<string, unknown>[]> {
    return this._t.get<Record<string, unknown>[]>('fetchyr/account/credentials');
  }

  async deleteCredentials(name: string): Promise<void> {
    await this._t.delete(`fetchyr/account/credentials/${encodeURIComponent(name)}`);
  }

  async listSessions(): Promise<Record<string, unknown>[]> {
    return this._t.get<Record<string, unknown>[]>('fetchyr/sessions');
  }

  async invalidateSession(artifactId: string): Promise<void> {
    await this._t.delete(`fetchyr/sessions/${artifactId}`);
  }

  /** Alias of invalidateSession. */
  async terminateSession(artifactId: string): Promise<void> {
    await this.invalidateSession(artifactId);
  }

  async createWorkflow(
    name: string,
    steps: Record<string, unknown>[],
    opts: { description?: string; workflowType?: string } = {},
  ): Promise<WorkflowResult> {
    const body: Record<string, unknown> = { name, steps };
    if (opts.description) body['description'] = opts.description;
    if (opts.workflowType) body['workflow_type'] = opts.workflowType;
    const raw = await this._t.post('fetchyr/workflows', body);
    return parseWorkflow(raw, name);
  }

  async executeWorkflow(
    workflowId: string,
    targetUrl: string,
    opts: { sessionArtifactId?: string; inputData?: Record<string, unknown> } = {},
  ): Promise<WorkflowExecutionResult> {
    const body: Record<string, unknown> = { target_url: targetUrl };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    if (opts.inputData) body['input_data'] = opts.inputData;
    const raw = await this._t.post(`fetchyr/workflows/${workflowId}/execute`, body);
    return parseExecution(raw);
  }

  async getExecution(workflowId: string, executionId: string): Promise<WorkflowExecutionResult> {
    const raw = await this._t.get(`fetchyr/workflows/${workflowId}/executions/${executionId}`);
    return parseExecution(raw);
  }

  /** Resume an execution paused for intervention (for example MFA). */
  async resumeExecution(workflowId: string, executionId: string, body: Record<string, unknown> = {}): Promise<WorkflowExecutionResult> {
    const raw = await this._t.post(`fetchyr/workflows/${workflowId}/executions/${executionId}/resume`, body);
    return parseExecution(raw);
  }

  async detectForms(url: string, opts: { sessionArtifactId?: string } = {}): Promise<FormDetectionResult> {
    const body: Record<string, unknown> = { url };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await this._t.post('fetchyr/form/detect', body);
    return {
      url: (raw['url'] as string | undefined) ?? url,
      forms: (raw['fields'] as Record<string, unknown>[] | undefined) ?? [],
      totalForms: Number(raw['forms_found'] ?? 0),
      loginFormDetected: Boolean(raw['login_form_detected']),
      error: (raw['error'] as string | undefined) ?? null,
    };
  }

  async fillForm(url: string, formData: Record<string, string>, opts: { sessionArtifactId?: string } = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { url, form_data: formData };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    return this._t.post('fetchyr/form/fill', body);
  }

  async detectMfa(url: string, opts: { sessionArtifactId?: string } = {}): Promise<MfaDetectionResult> {
    const body: Record<string, unknown> = { url };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await this._t.post('fetchyr/mfa/detect', body);
    return {
      mfaDetected: Boolean(raw['mfa_detected']),
      challengeId: (raw['challenge_id'] as string | undefined) ?? null,
      mfaType: (raw['mfa_type'] as string | undefined) ?? null,
      message: (raw['message'] as string | undefined) ?? null,
      error: (raw['error'] as string | undefined) ?? null,
    };
  }

  /** Resolve a queued MFA challenge with the code (or other resolution) the user supplied. */
  async submitMfa(challengeId: string, resolution: string): Promise<MfaChallenge> {
    const raw = await this._t.post(`fetchyr/mfa-queue/${challengeId}/resolve`, { resolution });
    return parseChallenge(raw);
  }

  async listMfaChallenges(): Promise<MfaChallenge[]> {
    const raw = await this._t.get<Record<string, unknown>[]>('fetchyr/mfa-queue');
    return (Array.isArray(raw) ? raw : []).map(parseChallenge);
  }

  async getMfaChallenge(challengeId: string): Promise<MfaChallenge> {
    return parseChallenge(await this._t.get(`fetchyr/mfa/challenges/${challengeId}`));
  }

  async getMfaStatistics(domain: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/mfa/statistics/${encodeURIComponent(domain)}`);
  }

  async listWorkflows(): Promise<Record<string, unknown>> {
    return this._t.get('fetchyr/workflows');
  }

  async getWorkflow(workflowId: string): Promise<WorkflowResult> {
    return parseWorkflow(await this._t.get(`fetchyr/workflows/${workflowId}`));
  }

  async updateWorkflow(
    workflowId: string,
    updates: { name?: string; description?: string; steps?: Record<string, unknown>[]; isActive?: boolean },
  ): Promise<WorkflowResult> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body['name'] = updates.name;
    if (updates.description !== undefined) body['description'] = updates.description;
    if (updates.steps !== undefined) body['steps'] = updates.steps;
    if (updates.isActive !== undefined) body['is_active'] = updates.isActive;
    return parseWorkflow(await this._t.patch(`fetchyr/workflows/${workflowId}`, body));
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    await this._t.delete(`fetchyr/workflows/${workflowId}`);
  }

  async getWorkflowStatistics(workflowId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/workflows/${workflowId}/statistics`);
  }

  async createMultiSiteWorkflow(
    name: string,
    sites: Record<string, unknown>[],
    opts: { description?: string; dependencies?: Record<string, unknown>; globalConfig?: Record<string, unknown> } = {},
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { name, sites };
    if (opts.description) body['description'] = opts.description;
    if (opts.dependencies) body['dependencies'] = opts.dependencies;
    if (opts.globalConfig) body['global_config'] = opts.globalConfig;
    return this._t.post('fetchyr/multi-site-workflows', body);
  }

  /** Whether a URL (or content hash) was already seen in a deduplication session. */
  async checkDuplicate(
    url: string,
    opts: { contentHash?: string; sessionId?: string } = {},
  ): Promise<DuplicateCheckResult> {
    const body: Record<string, unknown> = { url };
    if (opts.contentHash) body['content_hash'] = opts.contentHash;
    if (opts.sessionId) body['session_id'] = opts.sessionId;
    const raw = await this._t.post('fetchyr/deduplication/check', body);
    return {
      isDuplicate: Boolean(raw['is_duplicate']),
      originalUrl: (raw['original_url'] as string | undefined) ?? null,
      similarityScore: raw['similarity_score'] != null ? Number(raw['similarity_score']) : null,
      matchType: (raw['match_type'] as string | undefined) ?? null,
    };
  }

  async createDedupSession(name: string, opts: { strategy?: string } = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { name };
    if (opts.strategy) body['strategy'] = opts.strategy;
    return this._t.post('fetchyr/deduplication/sessions', body);
  }

  async listDedupSessions(): Promise<Record<string, unknown>[]> {
    return this._t.get<Record<string, unknown>[]>('fetchyr/deduplication/sessions/active');
  }

  async getDedupSession(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/sessions/${sessionId}`);
  }

  async getDedupSessionStatistics(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/sessions/${sessionId}/statistics`);
  }

  async getDedupDomainStatistics(domain: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/statistics/${encodeURIComponent(domain)}`);
  }

  // ── Auth-chain discovery (login flows that need user input) ──────────

  async discoverAuthChain(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post('fetchyr/auth-chain/discover', body);
  }

  async getAuthChainStatus(discoveryId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/auth-chain/${discoveryId}/status`);
  }

  async resumeAuthChainCredentials(discoveryId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post(`fetchyr/auth-chain/${discoveryId}/resume-credentials`, body);
  }

  async resumeAuthChainMfa(discoveryId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post(`fetchyr/auth-chain/${discoveryId}/resume-mfa`, body);
  }
}
