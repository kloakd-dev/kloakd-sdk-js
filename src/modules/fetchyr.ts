import type { HttpTransport } from '../_http.js';
import { postFollowingHandoff } from '../_handoff.js';
import type { HandoffOptions } from '../_handoff.js';
import { query, seg } from '../_params.js';
import type {
  DuplicateCheckResult,
  FormDetectionResult,
  LoginCookie,
  LoginSession,
  MfaChallenge,
  MfaDetectionResult,
  SessionResult,
  SessionStatus,
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

const optStr = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));

function parseSessionStatus(raw: Record<string, unknown>, artifactId: string): SessionStatus {
  return {
    artifactId: String(raw['artifact_id'] ?? artifactId),
    status: String(raw['status'] ?? ''),
    targetDomain: optStr(raw['target_domain']),
    authMethod: optStr(raw['auth_method']),
    createdAt: optStr(raw['created_at']),
    expiresAt: optStr(raw['expires_at']),
    lastUsedAt: optStr(raw['last_used_at']),
    pausedAt: optStr(raw['paused_at']),
    pauseReason: optStr(raw['pause_reason']),
    pauseMessage: optStr(raw['pause_message']),
    identity: (raw['identity'] as Record<string, unknown> | undefined) ?? {},
    requestsThisHour: raw['requests_this_hour'] != null ? Number(raw['requests_this_hour']) : null,
    protections: (raw['protections'] as Record<string, unknown> | undefined) ?? {},
  };
}

/** Options for `startLoginSession` (modules/fetchyr/router.py LoginSessionRequest). */
export interface LoginSessionOptions {
  /**
   * `interactive` (the API's default): the API opens the site's login and
   * asks for the credentials (and an MFA code) through the auth-chain
   * methods. `cookies`: use a session you already have in your own browser.
   */
  method?: 'interactive' | 'cookies';
  /** `cookies` method: your browser's cookies for the site. Required for it. */
  cookies?: LoginCookie[];
  /** `cookies` method: your browser's `navigator.userAgent`. Required for it. */
  userAgent?: string;
  /** Two-letter country the session's exit is in (where the account usually logs in from). */
  country?: string;
}

/** A dependency between two sites of a multi-site workflow (modules/fetchyr/router.py SiteDependencyModel). */
export interface SiteDependency {
  /** The site that waits. */
  dependentSite: string;
  /** The site that must complete first. */
  dependencySite: string;
  /** sequential (the API's default), data or conditional. */
  dependencyType?: string;
  condition?: string;
  dataRequirements?: string[];
  /** Max wait for the dependency, in seconds. */
  timeout?: number;
}

export class FetchyrNamespace {
  constructor(private readonly _t: HttpTransport) {}

  /**
   * Log in to a site with credentials stored under `credentialName`
   * (see storeCredentials); produces an authenticated session artifact.
   * A login still running after about 85 s is handed off as a job (202);
   * this follows it and returns the same result.
   */
  async authenticate(credentialName: string, targetUrl: string, opts: HandoffOptions = {}): Promise<SessionResult> {
    const raw = await postFollowingHandoff(this._t, 'fetchyr/authenticate', {
      credential_name: credentialName,
      target_url: targetUrl,
    }, opts);
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
    credentials: { username: string; password: string; extra?: Record<string, string> },
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { name, username: credentials.username, password: credentials.password };
    if (credentials.extra) body['extra'] = credentials.extra;
    return this._t.post('fetchyr/account/credentials', body);
  }

  async listCredentials(): Promise<Record<string, unknown>[]> {
    return this._t.get<Record<string, unknown>[]>('fetchyr/account/credentials');
  }

  async deleteCredentials(name: string): Promise<void> {
    await this._t.delete(`fetchyr/account/credentials/${seg(name)}`);
  }

  async listSessions(): Promise<Record<string, unknown>[]> {
    return this._t.get<Record<string, unknown>[]>('fetchyr/sessions');
  }

  async invalidateSession(artifactId: string): Promise<void> {
    await this._t.delete(`fetchyr/sessions/${seg(artifactId)}`);
  }

  /**
   * Start a session logged in as your own account on a site
   * (`POST fetchyr/login-sessions`). Interactive (the default): the answer
   * is `waiting_for_login` with a `discoveryId`; give the credentials
   * through `resumeAuthChainCredentials` / `resumeAuthChainMfa` and follow
   * `getAuthChainStatus`. With `method: 'cookies'` the session is made from
   * `cookies` and `userAgent` at once: `status` is `ready` and
   * `sessionArtifactId` is the id to pass as `sessionArtifactId` to fetch,
   * crawl and extract. The cookies method without cookies or a user agent
   * is a 422 (ApiError). Only the options given are sent.
   */
  async startLoginSession(targetUrl: string, opts: LoginSessionOptions = {}): Promise<LoginSession> {
    const body: Record<string, unknown> = { target_url: targetUrl };
    if (opts.method !== undefined) body['method'] = opts.method;
    if (opts.cookies !== undefined) body['cookies'] = opts.cookies;
    if (opts.userAgent !== undefined) body['user_agent'] = opts.userAgent;
    if (opts.country !== undefined) body['country'] = opts.country;
    const raw = await this._t.post('fetchyr/login-sessions', body);
    return {
      method: String(raw['method'] ?? opts.method ?? 'interactive'),
      status: String(raw['status'] ?? ''),
      targetUrl: String(raw['target_url'] ?? targetUrl),
      discoveryId: optStr(raw['discovery_id']),
      sessionArtifactId: optStr(raw['session_artifact_id']),
      next: (raw['next'] as Record<string, string> | undefined) ?? {},
      cookiesKept: raw['cookies_kept'] != null ? Number(raw['cookies_kept']) : null,
      cookiesDropped: (raw['cookies_dropped'] as string[] | undefined) ?? [],
      protections: (raw['protections'] as Record<string, unknown> | undefined) ?? {},
      message: String(raw['message'] ?? ''),
    };
  }

  /**
   * A login session's state (`GET fetchyr/sessions/{artifact_id}`): active,
   * paused (with `pauseReason` and `pauseMessage`), EXPIRED or INVALIDATED,
   * and the protections on its use. An unknown id is a 404 (ApiError).
   */
  async getSession(artifactId: string): Promise<SessionStatus> {
    return parseSessionStatus(await this._t.get(`fetchyr/sessions/${seg(artifactId)}`), artifactId);
  }

  /**
   * Put a paused session back to use
   * (`POST fetchyr/sessions/{artifact_id}/resume`). A session that is not
   * paused, or that the site signed out (`pauseReason` `logged_out`: log in
   * again with `startLoginSession`), is a 409 (ApiError).
   */
  async resumeSession(artifactId: string): Promise<SessionStatus> {
    return parseSessionStatus(await this._t.post(`fetchyr/sessions/${seg(artifactId)}/resume`, {}), artifactId);
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
    const raw = await this._t.post(`fetchyr/workflows/${seg(workflowId)}/execute`, body);
    return parseExecution(raw);
  }

  async getExecution(workflowId: string, executionId: string): Promise<WorkflowExecutionResult> {
    const raw = await this._t.get(`fetchyr/workflows/${seg(workflowId)}/executions/${seg(executionId)}`);
    return parseExecution(raw);
  }

  /** Resume an execution paused for intervention (for example MFA). */
  async resumeExecution(workflowId: string, executionId: string, body: Record<string, unknown> = {}): Promise<WorkflowExecutionResult> {
    const raw = await this._t.post(`fetchyr/workflows/${seg(workflowId)}/executions/${seg(executionId)}/resume`, body);
    return parseExecution(raw);
  }

  /** Detect the forms on a page; follows a 202 hand-off like authenticate. */
  async detectForms(url: string, opts: { sessionArtifactId?: string } & HandoffOptions = {}): Promise<FormDetectionResult> {
    const body: Record<string, unknown> = { url };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await postFollowingHandoff(this._t, 'fetchyr/form/detect', body, opts);
    return {
      url: (raw['url'] as string | undefined) ?? url,
      forms: (raw['fields'] as Record<string, unknown>[] | undefined) ?? [],
      totalForms: Number(raw['forms_found'] ?? 0),
      loginFormDetected: Boolean(raw['login_form_detected']),
      error: (raw['error'] as string | undefined) ?? null,
    };
  }

  /** Fill and submit a form; follows a 202 hand-off like authenticate. */
  async fillForm(url: string, formData: Record<string, string>, opts: { sessionArtifactId?: string } & HandoffOptions = {}): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { url, form_data: formData };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    return postFollowingHandoff(this._t, 'fetchyr/form/fill', body, opts);
  }

  /** Detect an MFA challenge on a page; follows a 202 hand-off like authenticate. */
  async detectMfa(url: string, opts: { sessionArtifactId?: string } & HandoffOptions = {}): Promise<MfaDetectionResult> {
    const body: Record<string, unknown> = { url };
    if (opts.sessionArtifactId) body['session_artifact_id'] = opts.sessionArtifactId;
    const raw = await postFollowingHandoff(this._t, 'fetchyr/mfa/detect', body, opts);
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
    const raw = await this._t.post(`fetchyr/mfa-queue/${seg(challengeId)}/resolve`, { resolution });
    return parseChallenge(raw);
  }

  async listMfaChallenges(): Promise<MfaChallenge[]> {
    const raw = await this._t.get<Record<string, unknown>[]>('fetchyr/mfa-queue');
    return (Array.isArray(raw) ? raw : []).map(parseChallenge);
  }

  async getMfaChallenge(challengeId: string): Promise<MfaChallenge> {
    return parseChallenge(await this._t.get(`fetchyr/mfa/challenges/${seg(challengeId)}`));
  }

  async getMfaStatistics(domain: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/mfa/statistics/${seg(domain)}`);
  }

  /** RPA workflows: `{workflows, total, page, page_size}`. */
  async listWorkflows(opts: { page?: number; pageSize?: number } = {}): Promise<Record<string, unknown>> {
    return this._t.get('fetchyr/workflows', query({ page: opts?.page, page_size: opts?.pageSize }));
  }

  async getWorkflow(workflowId: string): Promise<WorkflowResult> {
    return parseWorkflow(await this._t.get(`fetchyr/workflows/${seg(workflowId)}`));
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
    return parseWorkflow(await this._t.patch(`fetchyr/workflows/${seg(workflowId)}`, body));
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    await this._t.delete(`fetchyr/workflows/${seg(workflowId)}`);
  }

  async getWorkflowStatistics(workflowId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/workflows/${seg(workflowId)}/statistics`);
  }

  /**
   * Create a multi-site workflow. Each site is the API's site configuration
   * (`site_id`, `name`, `url`, `workflow_steps`, …); each dependency says
   * which site must finish before another.
   */
  async createMultiSiteWorkflow(
    name: string,
    sites: Record<string, unknown>[],
    opts: { description?: string; dependencies?: SiteDependency[]; globalConfig?: Record<string, unknown> } = {},
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = { name, sites };
    if (opts.description) body['description'] = opts.description;
    if (opts.dependencies) {
      body['dependencies'] = opts.dependencies.map((d) => {
        const dep: Record<string, unknown> = { dependent_site: d.dependentSite, dependency_site: d.dependencySite };
        if (d.dependencyType !== undefined) dep['dependency_type'] = d.dependencyType;
        if (d.condition !== undefined) dep['condition'] = d.condition;
        if (d.dataRequirements !== undefined) dep['data_requirements'] = d.dataRequirements;
        if (d.timeout !== undefined) dep['timeout'] = d.timeout;
        return dep;
      });
    }
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
    return this._t.get(`fetchyr/deduplication/sessions/${seg(sessionId)}`);
  }

  async getDedupSessionStatistics(sessionId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/sessions/${seg(sessionId)}/statistics`);
  }

  async getDedupDomainStatistics(domain: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/deduplication/statistics/${seg(domain)}`);
  }

  // ── Auth-chain discovery (login flows that need user input) ──────────

  async discoverAuthChain(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post('fetchyr/auth-chain/discover', body);
  }

  async getAuthChainStatus(discoveryId: string): Promise<Record<string, unknown>> {
    return this._t.get(`fetchyr/auth-chain/${seg(discoveryId)}/status`);
  }

  async resumeAuthChainCredentials(discoveryId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post(`fetchyr/auth-chain/${seg(discoveryId)}/resume-credentials`, body);
  }

  async resumeAuthChainMfa(discoveryId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this._t.post(`fetchyr/auth-chain/${seg(discoveryId)}/resume-mfa`, body);
  }
}
