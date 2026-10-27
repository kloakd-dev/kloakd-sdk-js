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
  /** True if success is true and error is null. */
  readonly ok: boolean;
}

export interface FetchEvent {
  type: string;
  tier: number | null;
  vendor: string | null;
  metadata: Record<string, unknown>;
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

export interface CrawlEvent {
  type: string;
  url: string | null;
  depth: number | null;
  pagesFound: number | null;
  metadata: Record<string, unknown>;
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

export interface ChatTurn {
  sessionId: string;
  intent: string;
  confidence: number;
  tier: number;
  response: string;
  entities: Record<string, unknown>;
  requiresAction: boolean;
  clarificationNeeded: string | null;
}

export interface ChatEvent {
  event: string;
  data: Record<string, unknown>;
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

export interface CrawlProgressEvent {
  type: string;
  url: string | null;
  page: number | null;
  total: number | null;
  success: boolean | null;
  error: string | null;
  metadata: Record<string, unknown>;
}
