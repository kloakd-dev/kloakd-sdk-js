/**
 * KLOAKD TypeScript SDK — Public exports.
 *
 * @example
 * ```typescript
 * import { Kloakd, RateLimitError } from 'kloakd-sdk';
 * ```
 */

export { Kloakd } from './client.js';
export type { KloakdOptions } from './client.js';

export {
  ApiError,
  AuthenticationError,
  KloakdError,
  NotEntitledError,
  RateLimitError,
  UpstreamError,
} from './errors.js';

export type {
  AnalyzeResult,
  ApiEndpoint,
  ChatEvent,
  ChatTurn,
  CrawlEvent,
  CrawlResult,
  DeduplicationResult,
  DiscoverEvent,
  DiscoverResult,
  ExtractionResult,
  FetchEvent,
  FetchResult,
  FetchyrResult,
  FormDetectionResult,
  MfaDetectionResult,
  MfaResult,
  NexusAnalyzeResult,
  NexusExecuteResult,
  NexusKnowledgeResult,
  NexusSynthesisResult,
  NexusVerifyResult,
  PageNode,
  ParseResult,
  SessionResult,
  WorkflowExecutionResult,
  WorkflowResult,
} from './models.js';
