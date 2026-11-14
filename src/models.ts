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
  children: string[];
  /** The node's parent in the listed tree (by default the page the crawl found it on). */
  parentUrl?: string | null;
  /**
   * A grouping folder of the displayed tree, not a fetched page
   * (`metadata.is_grouping`). Listed only with `includeGrouping`.
   */
  isGrouping?: boolean;
  /**
   * Whether the crawl has this page (`metadata.fetch_status`): `fetched`,
   * `unfetched` (asked for and not obtained; `fetchError` says why) or
   * `not_requested` (found, and the crawl stopped before asking for it).
   * Null when the API gave none.
   */
  fetchStatus: string | null;
  /** Why an `unfetched` page was not obtained (`metadata.fetch_error`), or null. */
  fetchError: string | null;
}

/**
 * A crawl as `webgrph.crawl` / `webgrph.waitForCrawl` return it. `hasMore`
 * and `total` are the SDK's own (`hasMore` is always false: every page was
 * loaded; `total` is `pages.length`).
 */
export interface CrawlResult extends Paginated {
  /** True when the crawl completed. A partial crawl also completes: see `isPartial`. */
  success: boolean;
  crawlId: string;
  /** queued, crawling, completed, failed, cancelled or held_quota. */
  status: string;
  /** The URL given to `crawl`; empty after `waitForCrawl` (the status answer has none). */
  url: string;
  /** Fetched pages only (grouping folders are not counted). */
  totalPages: number;
  /** Deepest fetched page. */
  maxDepthReached: number;
  pages: PageNode[];
  artifactId: string | null;
  error: string | null;
  /** A machine-readable reason for a failed crawl (for example `root_unfetched`, `held_quota_expired`), or null. */
  errorCode: string | null;
  /** The API's note on the crawl's state; for a held crawl, why it is held. Not an error. */
  message: string | null;
  /**
   * True when the crawl is paused because the organisation's quota ran out
   * (`status` is `held_quota`). It has not failed: it resumes by itself,
   * under the same id, when quota returns (an upgrade, a top-up or the next
   * billing period); call `webgrph.waitForCrawl(crawlId)` again then. A
   * crawl held for 30 days ends as failed with `errorCode`
   * `held_quota_expired`. `pages` is empty while held.
   */
  held: boolean;
  /** True when the crawl stopped before asking for every page it found. Null until the crawl reports it. */
  isPartial: boolean | null;
  /** Why it is partial: `time_budget`, `max_pages` or `error`. */
  partialReason: string | null;
  /** True when `webgrph.continueCrawl(crawlId)` can carry the crawl on. */
  resumable: boolean | null;
  /** Pages the crawl found. Null until reported. */
  pagesDiscovered: number | null;
  /** Pages the crawl fetched. Null until reported. */
  pagesFetched: number | null;
  /** Pages the crawl asked for and could not fetch. Null until reported. */
  pagesUnfetched: number | null;
  /** The crawl's time budget in seconds (`time_budget_s`). Null until the crawl reports it. */
  timeBudgetS: number | null;
  /** Seconds the crawl has run (`elapsed_s`). Null until the crawl reports it. */
  elapsedS: number | null;
  /** Seconds left of the time budget (`est_remaining_s`). Null until the crawl reports it. */
  estRemainingS: number | null;
  readonly ok: boolean;
}

/** `webgrph.continueCrawl`: the crawl is queued again under the same id. */
export interface CrawlContinueResult {
  success: boolean;
  crawlId: string;
  /** `queued`. */
  status: string;
}

/**
 * `webgrph.continueCrawl` / `webgrph.continueCrawlExtract` options. Each
 * value is clamped to the plan and may only be raised: a lower value is a
 * 422 (`continue_cannot_lower`). Unset values keep the job's own.
 */
export interface CrawlContinueOptions {
  maxPages?: number;
  maxDepth?: number;
}

/** `webgrph.continueCrawlExtract`: the job's crawl is queued again and the new pages are extracted. */
export interface CrawlExtractContinueResult {
  success: boolean;
  jobId: string;
  crawlId: string;
  /** `queued`. */
  status: string;
}

/** A crawl or crawl-extract estimate's limits for the plan. */
export interface CrawlEstimatePlanLimits {
  maxDepth: number | null;
  maxPages: number | null;
  planTier: string | null;
}

/** What the estimate's probe of the site found. */
export interface CrawlEstimateSite {
  reachable: boolean;
  /** Pages in the sitemap; null when no sitemap was found. */
  sitemapPages: number | null;
  /** Same-host links on the start page; null when it was not fetched. */
  homepageLinks: number | null;
  probeError: string | null;
}

/** A low–high range. */
export interface CrawlEstimateRange {
  low: number;
  high: number;
}

/**
 * `webgrph.estimateCrawl` / `webgrph.estimateCrawlExtract`: what a crawl
 * or crawl-extract with these options would do, before it starts. The
 * estimate is not metered.
 */
export interface CrawlEstimate {
  /** `crawl` or `crawl_extract`. */
  mode: string;
  url: string;
  /** After clamping to the plan. */
  maxDepth: number;
  /** After clamping to the plan. */
  maxPages: number;
  planLimits: CrawlEstimatePlanLimits;
  /** True when a requested value was lowered to the plan's limit. */
  clamped: boolean;
  site: CrawlEstimateSite;
  /** Pages the crawl would fetch; `source` is `sitemap`, `homepage_links` or `limit` (only the cap is known). */
  estPages: CrawlEstimateRange & { source: string };
  /** True when the site seems larger than `maxPages`. */
  willHitPageCap: boolean;
  /** The time budget the crawl will use, in seconds. */
  timeBudgetS: number;
  estDurationS: CrawlEstimateRange;
  estGb: number;
  /** Null when unknown. */
  gbRemaining: number | null;
  willExhaustQuota: boolean;
  /** A plain sentence when there is something to warn about, else null. */
  warning: string | null;
  /** What a crawl (or crawl & extract) does, in a sentence or two. */
  explanation: string;
}

/**
 * What a crawl-extract job's crawl did (the status answer's `crawl`). The
 * counts and `isPartial` are null until the crawl has reported them.
 */
export interface CrawlExtractCrawl {
  /** The crawl's own status, including `held_quota`. */
  status: string | null;
  isPartial: boolean | null;
  /** `time_budget`, `max_pages` or `error`. */
  partialReason: string | null;
  pagesDiscovered: number | null;
  pagesFetched: number | null;
  pagesUnfetched: number | null;
  cancelled: boolean;
  /** True when the crawl could not fetch its first page. */
  rootUnfetched: boolean;
  /** The crawl's error when it failed. */
  error: string | null;
  errorCode: string | null;
}

/**
 * What an export's rows cover, from its `X-Crawl-*` response headers. A
 * field is null when the API did not send its header.
 */
export interface ExportCrawl {
  status: string | null;
  isPartial: boolean | null;
  partialReason: string | null;
  pagesDiscovered: number | null;
  pagesFetched: number | null;
  pagesUnfetched: number | null;
  cancelled: boolean | null;
  rootUnfetched: boolean | null;
}

// ── Crawl-extract (webgrph/crawl-extract) and exports ────────────────────────

/** The file formats of the export routes. */
export type ExportFormat = 'json' | 'ndjson' | 'csv';

/** One field of an explicit selector schema (crawl_extract_router.py SelectorField). */
export interface CrawlExtractSelectorField {
  name: string;
  /** CSS selector, relative to the item. */
  selector?: string;
  /** Attribute to read; the text when omitted. */
  attribute?: string;
  /** `'list'` keeps every match. */
  type?: string;
}

/** What to extract from each crawled page. All optional: with nothing given the API decides per page. */
export interface CrawlExtractSpec {
  /** What the items are, e.g. `'products'`. */
  entityType?: string;
  /** Field names wanted. */
  fields?: string[];
  /** Explicit CSS selectors, tried first. Sent as `extract.schema`. */
  schema?: { itemSelector?: string; fields: CrawlExtractSelectorField[] };
}

/** The API's links for a crawl-extract job (paths under the API host). */
export interface CrawlExtractLinks {
  status: string;
  results: string;
  pages: string;
  cancel: string;
  export: Record<string, string>;
  crawlEvents: string;
  events: string;
}

/** The 202 answer of `webgrph.startCrawlExtract`. */
export interface CrawlExtractJob {
  jobId: string;
  crawlId: string;
  url: string;
  /** queued, crawling, extracting, completed, failed or cancelled. */
  status: string;
  /** The crawl limits the API applied (the tier's maxima when not given, clamped to them when given). */
  limits: { maxPages: number | null; maxDepth: number | null };
  links: CrawlExtractLinks | null;
}

/** One distinct set of fields among a job's rows; `shape` is what the results and export filters take. */
export interface CrawlExtractShape {
  shape: string;
  /** `item` or `page`. */
  kind: string;
  rows: number;
  pageTypes: string[];
  fields: string[];
}

/** `webgrph.getCrawlExtract`: a job's stage and counters. */
export interface CrawlExtractStatus {
  jobId: string;
  crawlId: string;
  url: string;
  /** queued, crawling, extracting, completed, failed or cancelled. */
  status: string;
  cancelRequested: boolean;
  progress: {
    pagesCrawled: number;
    /** Null until the crawl has finished. */
    pagesTotal: number | null;
    pagesExtracted: number;
    pagesFailed: number;
    items: number;
  };
  error: string | null;
  errorCode: string | null;
  /** The job's request as the API stored it (`crawl`, `extract`). */
  request: Record<string, unknown>;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  links: CrawlExtractLinks | null;
  /** Pages by how they were extracted (`failed` for those that were not). */
  pagesByMethod: Record<string, number>;
  shapes: CrawlExtractShape[];
  /**
   * What the job's crawl did; null when the API has no crawl for the job. A
   * completed job whose crawl is partial holds the rows of the pages that
   * crawl fetched, not of the whole site.
   */
  crawl: CrawlExtractCrawl | null;
  /** The job's crawl time budget in seconds (`time_budget_s`). Null until the crawl reports it. */
  timeBudgetS: number | null;
  /** Seconds the job's crawl has run (`elapsed_s`). Null until the crawl reports it. */
  elapsedS: number | null;
  /** Seconds left of the crawl's time budget (`est_remaining_s`). Null until the crawl reports it. */
  estRemainingS: number | null;
  /**
   * True when the job's crawl is paused because the organisation's quota
   * ran out (`crawl.status` is `held_quota`). The job has not failed and is
   * not finished: it carries on by itself when quota returns.
   */
  readonly held: boolean;
  /** True when the job has ended (completed, failed or cancelled). */
  readonly finished: boolean;
  /** True when the job completed. */
  readonly ok: boolean;
}

/** One extracted row: an item of a page, or the page itself (`rowKind` `page`). */
export interface CrawlExtractRow {
  pageUrl: string;
  pageType: string | null;
  /** `item` or `page`. */
  rowKind: string;
  itemIndex: number;
  /** The row's own fields. */
  data: Record<string, unknown>;
  shape: string | null;
}

/** One page of `webgrph.getCrawlExtractResults`; pass `nextCursor` back for the next. */
export interface CrawlExtractResultsPage {
  jobId: string;
  status: string;
  /** Rows matching the filters, over the whole job. */
  total: number;
  count: number;
  rows: CrawlExtractRow[];
  /** Null on the last page. */
  nextCursor: string | null;
}

/** One crawled page of a crawl-extract job and how it was extracted. */
export interface CrawlExtractPage {
  pageSeq: number;
  pageUrl: string;
  pageType: string | null;
  title: string | null;
  /** `extracted` or `failed`. */
  status: string;
  method: string | null;
  itemCount: number;
  detail: unknown;
  extractedAt: string | null;
}

/** `webgrph.getCrawlExtractPages`. */
export interface CrawlExtractPagesPage {
  jobId: string;
  status: string;
  count: number;
  offset: number;
  pages: CrawlExtractPage[];
}

/** `webgrph.cancelCrawlExtract`: `status` is `cancelled`, or `cancelling` while a worker still holds the job. */
export interface CrawlExtractCancelResult {
  success: boolean;
  jobId: string;
  crawlId: string;
  status: string;
}

/** A streamed export: read `body`; the rest is what the response headers say. */
export interface ExportDownload {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  /** The file name the API suggests (Content-Disposition). */
  filename: string | null;
  /**
   * The job's status when the export started (`X-Job-Status`). Only the
   * crawl-extract export sends it; it is null for a batch export
   * (`client.exportBatchJob`), whose route sends no such header. A job that
   * has not completed exports the rows it has so far.
   */
  jobStatus: string | null;
  /**
   * What the job's crawl covered (`X-Crawl-*` headers). Only the
   * crawl-extract export sends them; null for a batch export and when the
   * API sent none.
   */
  crawl: ExportCrawl | null;
}

/** An export written to a file. */
export interface SavedExport {
  path: string;
  bytes: number;
  contentType: string | null;
  filename: string | null;
  /** As `ExportDownload.jobStatus`: null for a batch export. */
  jobStatus: string | null;
  /** As `ExportDownload.crawl`: null for a batch export. */
  crawl: ExportCrawl | null;
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
  /** Always true: a failed analysis throws. */
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
  /** Always true: a failed synthesis throws. */
  readonly ok: boolean;
}

/** One safety check of `nexus.verify` (the API's `safety_checks[]`). */
export interface NexusSafetyCheck {
  property: string;
  passed: boolean;
  details: string;
}

export interface NexusVerifyResult {
  strategyId: string;
  verified: boolean;
  /** `"verified"` or `"unsafe"`; null when the API gave none. */
  status: string | null;
  safetyScore: number;
  riskScore: number;
  /** The rules the strategy breaks. */
  violations: string[];
  /** Every check made, passed or not. */
  safetyChecks: NexusSafetyCheck[];
  verificationResultId: string | null;
  durationMs: number;
  /** The same as `verified`. */
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

export interface ExtractionResult {
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
  /** For a fresh scrape, the level it ran at: `level1` or `level2`; otherwise null. */
  level: string | null;
  /** Why that level: requested, or (prefixed `auto:`) what automatic mode chose it for. */
  levelReason: string | null;
  /** When `authRequired`: the ways to log in that the API offers (`login_options`), or null. */
  loginOptions: Record<string, unknown> | null;
  readonly ok: boolean;
}

/** One cookie for `fetchyr.startLoginSession` with `method: 'cookies'`, as a browser exports it. */
export interface LoginCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  /** Expiry as seconds since the epoch. */
  expires?: number;
  /** Expiry as browser extensions export it. */
  expirationDate?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

/** `fetchyr.startLoginSession` (modules/fetchyr/router.py LoginSessionResponse). */
export interface LoginSession {
  /** `interactive` or `cookies`. */
  method: string;
  /** `waiting_for_login` (interactive: the login is still to be done) or `ready` (cookies: the session exists). */
  status: string;
  targetUrl: string;
  /** Interactive: the auth-chain discovery to follow (`fetchyr.getAuthChainStatus`). */
  discoveryId: string | null;
  /** Cookies: the session's artifact id, for `sessionArtifactId` options and `fetchyr.getSession`. */
  sessionArtifactId: string | null;
  /** What to call next, in the API's words. */
  next: Record<string, string>;
  /** Cookies: how many of the given cookies the session keeps. */
  cookiesKept: number | null;
  /** Cookies: the names of the cookies the API did not keep. */
  cookiesDropped: string[];
  /** The limits the API keeps on the session's use. */
  protections: Record<string, unknown>;
  message: string;
}

/** A login session's state (modules/fetchyr/router.py SessionStatusResponse). */
export interface SessionStatus {
  artifactId: string;
  /** `active`, `paused`, `EXPIRED` or `INVALIDATED`. */
  status: string;
  targetDomain: string | null;
  authMethod: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  pausedAt: string | null;
  /** `logged_out`, `rate_limited` or `challenged`. */
  pauseReason: string | null;
  pauseMessage: string | null;
  identity: Record<string, unknown>;
  requestsThisHour: number | null;
  protections: Record<string, unknown>;
}

// ── High-level orchestrator ───────────────────────────────────────────────────

export interface CrawlPage {
  success: boolean;
  url: string;
  statusCode: number;
  tierUsed: number;
  html: string | null;
  /** The first extracted record. */
  structuredData: Record<string, unknown> | null;
  /** Every extracted record (one per item when the schema has an item selector). */
  records?: Record<string, unknown>[];
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
  /** The discovery crawl's id (for `webgrph.waitForCrawl` and `webgrph.continueCrawl`). */
  crawlId: string;
  /** The discovery crawl's status: completed, cancelled or held_quota. */
  status: string;
  /** The API's note on the crawl's state; for a held crawl, why it is held. */
  message: string | null;
  /**
   * True when the discovery crawl is paused because the organisation's
   * quota ran out (see `CrawlResult.held`). No page was fetched: `pages` is
   * empty, `success` is false and `error` is null.
   */
  held: boolean;
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

// ── Batch jobs (batch-jobs) ──────────────────────────────────────────────────

/** A batch job (kernel/jobs_runs_router.py BatchJob). */
export interface BatchJob {
  id: string;
  name: string;
  /**
   * pending, running, paused, held_quota, completed, failed or cancelled.
   * A paused batch starts no further item until it is resumed; items that
   * were already running finish.
   */
  status: string;
  totalItems: number;
  /** Items that completed or failed. */
  completedItems: number;
  createdAt: string;
  /** The API's note for a paused batch or one held for quota; null otherwise. */
  message: string | null;
}

/** One page of the organisation's batch jobs, newest first (BatchJobsList). */
export interface BatchJobsPage {
  /** All of the organisation's batch jobs, not only this page. */
  total: number;
  batchJobs: BatchJob[];
}

/** One item (URL) of a batch, as `batch-jobs/{id}/results` lists it. */
export interface BatchJobItem {
  jobId: string;
  url: string | null;
  /** pending, running, held_quota, completed, failed or cancelled. */
  status: string;
  /** What the item extracted; null until it completes. */
  extractedData: unknown;
  /** Records of a detected API the item's URL names; null otherwise. */
  apiData: Record<string, unknown> | null;
}

/** A batch's items and their results (BatchJobResults). */
export interface BatchJobResults {
  batchJobId: string;
  /** The items asked for: all of them, or `limit` from `offset`, in creation order. */
  results: BatchJobItem[];
  /**
   * Counts of the whole batch when `limit` was given; without `limit` (and
   * with an `offset`) they count the items returned.
   */
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
}

// ── Unified scrape (scraping/unified) ────────────────────────────────────────

/** One step of a unified scrape's escalation (EscalationEvent). */
export interface UnifiedEscalation {
  from: string;
  to: string;
  reason: string;
  timestamp: string;
}

/** The answer of `client.unifiedScrape` (unified_scraping.py UnifiedScrapeResponse). */
export interface UnifiedScrapeResult {
  success: boolean;
  /** The scrape's job: read it with `client.getUnifiedScrape(jobId)`. */
  jobId: string;
  /** level1, level2, or preflight when a login page was found before any scrape. */
  level: string;
  status: string;
  escalationPath: UnifiedEscalation[];
  message: string;
  metadata: Record<string, unknown> | null;
  /**
   * True when the URL is behind a login: nothing was scraped, `status` is
   * `auth_required` and `discoveryId` names the auth-chain discovery
   * (`fetchyr.getAuthChainStatus`). `jobId` then names no stored job.
   */
  authRequired: boolean;
  discoveryId: string | null;
}

/** Progress of a running unified scrape (ProgressDetail). */
export interface UnifiedScrapeProgress {
  percentage: number;
  currentStep: string;
  itemsFound: number | null;
  itemsTarget: number | null;
  /** The first few results, when there are any. */
  partialResults: Record<string, unknown>[] | null;
}

/** The state of a unified scrape job (unified_scraping.py JobStatusResponse). */
export interface UnifiedScrapeStatus {
  id: string;
  status: string;
  level: string;
  progress: number | null;
  /** Set while the job is running. */
  progressDetail: UnifiedScrapeProgress | null;
  createdAt: string;
  updatedAt: string | null;
  completedAt: string | null;
  error: string | null;
  /** The job's stored result document; null until there is one. */
  result: Record<string, unknown> | null;
  escalationPath: UnifiedEscalation[];
}
