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
export type { ExtractSchema, FieldSpec, SchemaSpec, PageOptions } from './modules/kolektr.js';
export type { SiteDependency } from './modules/fetchyr.js';
export type { FetchOptions, FetchAsyncOptions } from './modules/evadr.js';
export type { HandoffOptions } from './_handoff.js';
export type { CrawlOptions } from './modules/webgrph.js';

export type {
  AnalyzeResult,
  ChatEvent,
  ChatTurn,
  CrawlEvent,
  CrawlPage,
  CrawlProgressEvent,
  CrawlResult,
  DuplicateCheckResult,
  ExtractionResult,
  FetchEvent,
  FetchResult,
  FormDetectionResult,
  MfaChallenge,
  MfaDetectionResult,
  NexusAnalyzeResult,
  NexusExecuteResult,
  NexusKnowledgeResult,
  NexusSynthesisResult,
  NexusVerifyResult,
  PageNode,
  ParseResult,
  PipelineEvent,
  SessionResult,
  SiteCrawlResult,
  WorkflowExecutionResult,
  WorkflowResult,
} from './models.js';
