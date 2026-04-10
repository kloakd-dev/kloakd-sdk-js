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

export interface ApiEndpoint {
  url: string;
  method: string;
  apiType: string;
  confidence: number;
  parameters: Record<string, unknown>;
}

export interface DiscoverResult extends Paginated {
  success: boolean;
  discoveryId: string;
  url: string;
  totalEndpoints: number;
  endpoints: ApiEndpoint[];
  artifactId: string | null;
  error: string | null;
  readonly ok: boolean;
}

export interface DiscoverEvent {
  type: string;
  endpointUrl: string | null;
  apiType: string | null;
  metadata: Record<string, unknown>;
}

// ── Nexus ─────────────────────────────────────────────────────────────────────

export interface NexusAnalyzeResult {
  perceptionId: string;
  strategy: Record<string, unknown>;
  pageType: string;
  complexityLevel: string;
  artifactId: string | null;
  durationMs: number;
  error: string | null;
  readonly ok: boolean;
}

export interface NexusSynthesisResult {
  strategyId: string;
  strategyName: string;
  generatedCode: string;
  artifactId: string | null;
  synthesisTimeMs: number;
  error: string | null;
  readonly ok: boolean;
}

export interface NexusVerifyResult {
  verificationResultId: string;
  isSafe: boolean;
  riskScore: number;
  safetyScore: number;
  violations: string[];
  durationMs: number;
  error: string | null;
  readonly ok: boolean;
}

export interface NexusExecuteResult {
  executionResultId: string;
  success: boolean;
  records: Record<string, unknown>[];
  artifactId: string | null;
  durationMs: number;
  error: string | null;
  readonly ok: boolean;
}

export interface NexusKnowledgeResult extends Paginated {
  learnedConcepts: Record<string, unknown>[];
  learnedPatterns: Record<string, unknown>[];
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
  url: string;
  artifactId: string | null;
  screenshotUrl: string | null;
  error: string | null;
  readonly ok: boolean;
}

export interface FetchyrResult {
  success: boolean;
  url: string;
  statusCode: number;
  html: string | null;
  artifactId: string | null;
  sessionArtifactId: string;
  error: string | null;
  readonly ok: boolean;
}

export interface WorkflowResult {
  workflowId: string;
  name: string;
  steps: Record<string, unknown>[];
  url: string | null;
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
  records: Record<string, unknown>[];
  error: string | null;
  readonly ok: boolean;
}

export interface FormDetectionResult {
  forms: Record<string, unknown>[];
  totalForms: number;
  error: string | null;
}

export interface MfaDetectionResult {
  mfaDetected: boolean;
  challengeId: string | null;
  mfaType: string | null;
  error: string | null;
}

export interface MfaResult {
  success: boolean;
  sessionArtifactId: string | null;
  error: string | null;
}

export interface DeduplicationResult {
  uniqueRecords: Record<string, unknown>[];
  duplicateCount: number;
  totalInput: number;
  error: string | null;
  readonly ok: boolean;
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
