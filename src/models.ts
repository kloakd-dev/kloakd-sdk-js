/**
 * KLOAKD SDK — TypeScript interfaces for all result models.
 *
 * All field names use camelCase per §4 of the API design doc.
 * Nullable fields use `T | null` (not undefined) for JSON compatibility.
 */

// ── Common ────────────────────────────────────────────────────────────────────

/** Pagination envelope included in all list-returning responses. */
export interface Paginated {
  hasMore: boolean;
  total: number;
}

// ── Evadr ─────────────────────────────────────────────────────────────────────

export interface FetchResult {
  success: boolean;
  url: string;
  statusCode: number;
  tierUsed: number;
  html: string | null;
  vendorDetected: string | null;
  antiBotBypassed: boolean;
  artifactId: string | null;
  error: string | null;
  /** True when the API found a login page at the URL; `html` is then null. */
  authRequired: boolean;
  /** The auth-chain discovery id when `authRequired` (see `fetchyr.getAuthChainStatus`). */
  discoveryId: string | null;
  /** True if success is true and error is null. */
  readonly ok: boolean;
}

/**
 * A pipeline progress event (`core/pipeline/models.py` PipelineEvent), as
 * the API streams for crawls (`webgrph/crawl/{id}/events`) and fetch jobs.
 */
export interface PipelineEvent {
  /** pipeline_start, stage_start, stage_progress, pipeline_step, pipeline_complete, pipeline_error, … */
  eventType: string;
  stageId: string | null;
  status: string | null;
  message: string | null;
  progressPct: number | null;
  metadata: Record<string, unknown>;
  /** The structured pipeline error (`error_code`, `user_message`, …), or null. */
  error: Record<string, unknown> | null;
  sequence: number | null;
}

/**
 * A fetch job event (`evadr/jobs/{id}/events`). The API streams pipeline
 * events when it has them (`type` is then their `event_type`); otherwise it
 * polls the job and sends `{type: STATUS|COMPLETE|FAILED|ERROR, status?,
 * tier_used?, artifact_id?, error?}`.
 */
export interface FetchEvent extends Omit<PipelineEvent, 'eventType' | 'error'> {
  type: string;
  /** COMPLETE: the tier that fetched the page. */
  tierUsed: number | null;
  /** COMPLETE: the fetched content's artifact id. */
  artifactId: string | null;
  /** FAILED/ERROR: the error string; a pipeline event's error object. */
  error: string | Record<string, unknown> | null;
}

export interface AnalyzeResult {
  blocked: boolean;
  vendor: string | null;
  confidence: number;
  recommendedActions: string[];
}

// ── Webgrph ───────────────────────────────────────────────────────────────────

export interface PageNode {
  url: string;
  depth: number;
  title: string | null;
  statusCode: number | null;
  children: string[];
}

export interface CrawlResult extends Paginated {
  success: boolean;
  crawlId: string;
  /** queued, crawling, completed, failed or cancelled. */
  status: string;
  url: string;
  totalPages: number;
  maxDepthReached: number;
  pages: PageNode[];
  artifactId: string | null;
  error: string | null;
  readonly ok: boolean;
}

/** A crawl progress event: a pipeline event with the crawl's id. */
export interface CrawlEvent extends PipelineEvent {
  crawlId: string;
}

// ── Skanyr ────────────────────────────────────────────────────────────────────

// ── Nexus ─────────────────────────────────────────────────────────────────────

export interface NexusAnalyzeResult {
  url: string;
  perceptionId: string;
  reasoningId: string | null;
  strategy: Record<string, unknown>;
  pageType: string;
  confidence: number;
  artifactId: string | null;
  error: string | null;
  readonly ok: boolean;
}

export interface NexusSynthesisResult {
  url: string;
  goal: string;
  strategyId: string;
  strategyName: string;
  strategyType: string | null;
  /** The generated extraction program. */
  program: string;
  steps: Record<string, unknown>[];
  confidence: number;
  synthesisTimeMs: number;
  error: string | null;
  readonly ok: boolean;
}

export interface NexusVerifyResult {
  strategyId: string;
  verified: boolean;
  safetyScore: number;
  violations: string[];
  error: string | null;
  readonly ok: boolean;
}

export interface NexusExecuteResult {
  url: string;
  strategyId: string;
  success: boolean;
  records: Record<string, unknown>[];
  artifactId: string | null;
  durationMs: number;
  /** The id to pass to `nexus.knowledge()`; null when the API gave none. */
  executionResultId: string | null;
  error: string | null;
  readonly ok: boolean;
}

export interface NexusKnowledgeResult {
  executionResultId: string;
  learnedConcepts: Record<string, unknown>[];
  patterns: Record<string, unknown>[];
  totalPatterns: number;
  durationMs: number;
  error: string | null;
  readonly ok: boolean;
}

// ── Parlyr ────────────────────────────────────────────────────────────────────

export interface ParseResult {
  intent: string;
  confidence: number;
  tier: number;
  source: string;
  entities: Record<string, unknown>;
  requiresAction: boolean;
  clarificationNeeded: string | null;
  reasoning: string | null;
  detectedUrl: string | null;
  readonly ok: boolean;
}

/**
 * One chat turn, collected from the API's SSE events
 * (`application/services/chat_orchestrator.py` ChatEvent).
 */
export interface ChatTurn {
  sessionId: string;
  /** The `content` of the `text` and `clarification` events, joined by newlines. */
  response: string;
  /** `data.intent` of the last `interpretation` event; null when the API gave none (it usually does not). */
  intent: string | null;
  /** `data` of the last `interpretation` event (url, entity, fields, summary, …), or null. */
  interpretation: Record<string, unknown> | null;
  /** The `content` of the last `clarification` event, or null. */
  clarificationNeeded: string | null;
  /** `data` of each `results` event (items, count, url, job_id, …). */
  results: Record<string, unknown>[];
  /** The `content` of each `error` event. */
  errors: string[];
  /** The `content` of each `warning` event. */
  warnings: string[];
  /** Every event of the turn, in order (without the closing `end`). */
  events: ChatEvent[];
  /** True when no `error` event arrived. */
  readonly ok: boolean;
}

/**
 * A chat SSE event. `type` is one of thinking, interpretation, progress,
 * results, error, warning, auth_required, mfa_required, clarification,
 * export_ready, text.
 */
export interface ChatEvent {
  type: string;
  content: string | null;
  data: Record<string, unknown> | null;
  actions: Record<string, unknown>[] | null;
  timestamp: string | null;
}

// ── Fetchyr ───────────────────────────────────────────────────────────────────

export interface SessionResult {
  success: boolean;
  sessionId: string;
  /** The URL logged into (the request's target). */
  url: string;
  artifactId: string | null;
  targetDomain: string | null;
  authMethod: string | null;
  error: string | null;
  readonly ok: boolean;
}

export interface WorkflowResult {
  workflowId: string;
  name: string;
  description: string | null;
  workflowType: string | null;
  steps: Record<string, unknown>[];
  isActive: boolean;
  createdAt: string;
  error: string | null;
  readonly ok: boolean;
}

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
  readonly ok: boolean;
}

export interface FormDetectionResult {
  url: string;
  /** The detected form fields. */
  forms: Record<string, unknown>[];
  totalForms: number;
  loginFormDetected: boolean;
  error: string | null;
}

export interface MfaDetectionResult {
  mfaDetected: boolean;
  challengeId: string | null;
  mfaType: string | null;
  message: string | null;
  error: string | null;
}

export interface MfaChallenge {
  id: string;
  sessionId: string | null;
  mfaType: string | null;
  status: string;
  challengeData: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  originalUrl: string | null;
  similarityScore: number | null;
  matchType: string | null;
}

// ── Kolektr ───────────────────────────────────────────────────────────────────

export interface ExtractionResult extends Paginated {
  success: boolean;
  url: string;
  method: string;
  records: Record<string, unknown>[];
  totalRecords: number;
  pagesScraped: number;
  artifactId: string | null;
  jobId: string | null;
  error: string | null;
  /** True when the API found a login page at the URL instead of content. */
  authRequired: boolean;
  /** The auth-chain discovery id when `authRequired`. */
  discoveryId: string | null;
  readonly ok: boolean;
}

// ── High-level orchestrator ───────────────────────────────────────────────────

export interface CrawlPage {
  success: boolean;
  url: string;
  statusCode: number;
  tierUsed: number;
  html: string | null;
  structuredData: Record<string, unknown> | null;
  artifactId: string | null;
  error: string | null;
  readonly ok: boolean;
}

export interface SiteCrawlResult {
  success: boolean;
  url: string;
  totalPagesDiscovered: number;
  pagesFetched: number;
  pagesFailed: number;
  pages: CrawlPage[];
  crawlArtifactId: string | null;
  error: string | null;
}

/**
 * A progress event of `client.crawlStream` (made by the SDK, not the API):
 * discovery_started, discovery_complete, page_fetching, page_fetched,
 * page_failed, crawl_complete.
 */
export interface CrawlProgressEvent {
  type: string;
  url: string | null;
  page: number | null;
  total: number | null;
  success: boolean | null;
  error: string | null;
  metadata: Record<string, unknown>;
}
