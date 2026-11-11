/**
 * KLOAKD TypeScript SDK — Public exports.
 *
 * @example
 * ```typescript
 * import { Kloakd, RateLimitError } from 'kloakd-sdk';
 * ```
 */

export { Kloakd } from './client.js';
export type { KloakdOptions, CrawlOrchestratorOptions } from './client.js';

export {
  ApiError,
  AuthenticationError,
  BillingUnavailableError,
  ConcurrencyLimitError,
  ForbiddenError,
  JobFailedError,
  JobTimeoutError,
  KloakdError,
  NotEntitledError,
  PaymentRequiredError,
  QuotaExceededError,
  RateLimitError,
  UpstreamError,
} from './errors.js';

export { SDK_VERSION, USER_AGENT } from './_http.js';
export { toSchemaSpec } from './modules/kolektr.js';
export type { ExtractSchema, ExtractHtmlOptions, FieldSpec, SchemaSpec, ShorthandField, PageOptions } from './modules/kolektr.js';
export type { SiteDependency } from './modules/fetchyr.js';
export type { FetchOptions, FetchAsyncOptions } from './modules/evadr.js';
export type { HandoffOptions } from './_handoff.js';
export { CRAWL_PAGES_DEFAULT_LIMIT, CRAWL_PAGES_MAX_LIMIT } from './modules/webgrph.js';
export { CRAWL_EXTRACT_MAX_LIMIT } from './modules/webgrph.js';
export type {
  CrawlExtractExportOptions,
  CrawlExtractFilters,
  CrawlExtractOptions,
  CrawlExtractPagesOptions,
  CrawlExtractResultsOptions,
  CrawlExtractWaitOptions,
  CrawlOptions,
  CrawlPagesOptions,
} from './modules/webgrph.js';

export type {
  AnalyzeResult,
  ChatEvent,
  ChatTurn,
  CrawlEvent,
  CrawlExtractCancelResult,
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
  ExportDownload,
  ExportFormat,
  ExtractionResult,
  FetchEvent,
  FetchResult,
  FormDetectionResult,
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
  SiteCrawlResult,
  WorkflowExecutionResult,
  WorkflowResult,
} from './models.js';
