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
  JobFailedError,
  JobTimeoutError,
  KloakdError,
  NotEntitledError,
  PaymentRequiredError,
  QuotaExceededError,
  RateLimitError,
  UpstreamError,
} from './errors.js';

export { SDK_VERSION } from './_http.js';
export { toSchemaSpec } from './modules/kolektr.js';
export type { FieldSpec, SchemaSpec, PageOptions } from './modules/kolektr.js';
export type { FetchOptions, FetchAsyncOptions } from './modules/evadr.js';
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
  SessionResult,
  SiteCrawlResult,
  WorkflowExecutionResult,
  WorkflowResult,
} from './models.js';
