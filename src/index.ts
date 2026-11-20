/**
 * KLOAKD TypeScript SDK — Public exports.
 *
 * @example
 * ```typescript
 * import { Kloakd, RateLimitError } from 'kloakd-sdk';
 * ```
 */

export { Kloakd } from './client.js';
export type { BatchJobOptions, KloakdOptions, CrawlOrchestratorOptions, UnifiedScrapeOptions } from './client.js';

export {
  ApiError,
  AuthenticationError,
  BillingUnavailableError,
  ConcurrencyLimitError,
  CostAcknowledgementRequiredError,
  ForbiddenError,
  JobFailedError,
  JobTimeoutError,
  KloakdError,
  NotEntitledError,
  PaymentRequiredError,
  QuotaExceededError,
  RateLimitError,
  RobotsCheckUnavailableError,
  RobotsDisallowedError,
  RobotsExitsRefusedError,
  ROBOTS_ACKNOWLEDGE_FIELD,
  UpstreamError,
} from './errors.js';
export type { RobotsAcknowledgementOption } from './_params.js';

export { SDK_VERSION, USER_AGENT } from './_http.js';
export { toSchemaSpec } from './modules/kolektr.js';
export type { ExtractSchema, ExtractHtmlOptions, FieldSpec, SchemaSpec, ShorthandField, PageOptions } from './modules/kolektr.js';
export type { LoginSessionOptions, SiteDependency } from './modules/fetchyr.js';
export type { FetchOptions, FetchAsyncOptions } from './modules/evadr.js';
export type { HandoffOptions } from './_handoff.js';
export { CRAWL_PAGES_DEFAULT_LIMIT, CRAWL_PAGES_MAX_LIMIT } from './modules/webgrph.js';
export { CRAWL_EXTRACT_MAX_LIMIT } from './modules/webgrph.js';
export type {
  CrawlCostOptions,
  CrawlEstimateOptions,
  CrawlExtractEstimateOptions,
  CrawlExtractExportOptions,
  CrawlExtractFilters,
  CrawlExtractOptions,
  CrawlExtractPagesOptions,
  CrawlExtractResultsOptions,
  CrawlExtractWaitOptions,
  CrawlOptions,
  CrawlPagesOptions,
  CrawlWaitOptions,
  MapSiteOptions,
} from './modules/webgrph.js';

export type {
  AnalyzeResult,
  Artifact,
  BatchJob,
  BatchJobItem,
  BatchJobResults,
  BatchJobsPage,
  ChatEvent,
  ChatTurn,
  CrawlContinueOptions,
  CrawlContinueResult,
  CrawlEstimate,
  CrawlEstimateData,
  CrawlEstimateDataRange,
  CrawlEstimatePlanLimits,
  CrawlEstimateRange,
  CrawlEstimateSite,
  CrawlEvent,
  CrawlExtractCancelResult,
  CrawlExtractContinueResult,
  CrawlExtractCrawl,
  CrawlExtractJob,
  CrawlExtractLinks,
  CrawlExtractPage,
  CrawlExtractPagesPage,
  CrawlExtractResultsPage,
  CrawlExtractRow,
  CrawlExtractSelectorField,
  CrawlExtractShape,
  CrawlExtractSpec,
  CrawlExtractStatus,
  CrawlPage,
  CrawlProgressEvent,
  CrawlResult,
  DuplicateCheckResult,
  ExportCrawl,
  ExportDownload,
  ExportFormat,
  ExtractionResult,
  FetchEvent,
  FetchResult,
  FormDetectionResult,
  IncludeResource,
  LoginCookie,
  LoginSession,
  MfaChallenge,
  MfaDetectionResult,
  NexusAnalyzeResult,
  NexusSafetyCheck,
  NexusSynthesisResult,
  NexusVerifyResult,
  PageNode,
  ParseResult,
  PipelineEvent,
  SavedExport,
  SessionResult,
  SessionStatus,
  SiteCrawlResult,
  SiteMap,
  SiteMapBranch,
  UnifiedEscalation,
  UnifiedScrapeProgress,
  UnifiedScrapeResult,
  UnifiedScrapeStatus,
  WorkflowExecutionResult,
  WorkflowResult,
} from './models.js';
