/**
 * KLOAKD TypeScript SDK — Main client class.
 *
 * @example
 * ```typescript
 * import { Kloakd } from 'kloakd-sdk';
 *
 * const client = new Kloakd({
 *   apiKey: 'sk-live-abc123',
 *   organizationId: 'your-org-id',
 * });
 *
 * const result = await client.crawl('https://example.com', {
 *   maxPages: 50,
 *   extractSchema: { title: 'css:h1' },
 * });
 * for (const page of result.pages) {
 *   if (page.ok) console.log(page.url, page.structuredData);
 * }
 * ```
 */

import { HttpTransport } from './_http.js';
import { EvadrNamespace } from './modules/evadr.js';
import { FetchyrNamespace } from './modules/fetchyr.js';
import { KolektrNamespace } from './modules/kolektr.js';
import { NexusNamespace } from './modules/nexus.js';
import { ParlyrNamespace } from './modules/parlyr.js';
import { SkanyrNamespace } from './modules/skanyr.js';
import { WebgrphNamespace } from './modules/webgrph.js';
import type { CrawlPage, CrawlProgressEvent, SiteCrawlResult } from './models.js';

const DEFAULT_BASE_URL = 'https://api.kloakd.dev';
const DEFAULT_TIMEOUT = 60;
const DEFAULT_MAX_RETRIES = 3;

export interface KloakdOptions {
  apiKey: string;
  organizationId: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  /** Injected fetch — for testing only. */
  fetchImpl?: typeof fetch;
}

export interface CrawlOrchestratorOptions {
  maxDepth?: number;
  maxPages?: number;
  extractSchema?: Record<string, string>;
  outputFormat?: 'json' | 'markdown';
  includeExternalLinks?: boolean;
  sessionArtifactId?: string;
}

export class Kloakd {
  readonly evadr: EvadrNamespace;
  readonly webgrph: WebgrphNamespace;
  readonly skanyr: SkanyrNamespace;
  readonly nexus: NexusNamespace;
  readonly parlyr: ParlyrNamespace;
  readonly fetchyr: FetchyrNamespace;
  readonly kolektr: KolektrNamespace;

  private readonly _transport: HttpTransport;

  constructor(opts: KloakdOptions) {
    if (!opts.apiKey?.trim()) throw new Error('Kloakd: apiKey is required');
    if (!opts.organizationId?.trim()) throw new Error('Kloakd: organizationId is required');

    this._transport = new HttpTransport({
      apiKey: opts.apiKey,
      organizationId: opts.organizationId,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      ...(opts.fetchImpl !== undefined && { fetchImpl: opts.fetchImpl }),
    });

    this.evadr = new EvadrNamespace(this._transport);
    this.webgrph = new WebgrphNamespace(this._transport);
    this.skanyr = new SkanyrNamespace(this._transport);
    this.nexus = new NexusNamespace(this._transport);
    this.parlyr = new ParlyrNamespace(this._transport);
    this.fetchyr = new FetchyrNamespace(this._transport);
    this.kolektr = new KolektrNamespace(this._transport);
  }

  async crawl(url: string, opts: CrawlOrchestratorOptions = {}): Promise<SiteCrawlResult> {
    const crawlResult = await this.webgrph.crawl(url, {
      maxDepth: opts.maxDepth ?? 3,
      maxPages: opts.maxPages ?? 100,
      includeExternalLinks: opts.includeExternalLinks ?? false,
      ...(opts.sessionArtifactId && { sessionArtifactId: opts.sessionArtifactId }),
    });

    const pages: CrawlPage[] = [];
    let fetched = 0;
    let failed = 0;

    for (const node of crawlResult.pages) {
      try {
        const fetchResult = await this.evadr.fetch(node.url, {
          ...(opts.sessionArtifactId && { sessionArtifactId: opts.sessionArtifactId }),
        });

        let structuredData: Record<string, unknown> | null = null;
        if (opts.extractSchema && fetchResult.ok) {
          try {
            const extraction = await this.kolektr.page(node.url, {
              schema: opts.extractSchema,
              ...(fetchResult.artifactId && { fetchArtifactId: fetchResult.artifactId }),
            });
            structuredData = extraction.records.length > 0
              ? extraction.records[0] ?? null
              : null;
          } catch {
            // Extraction failure is non-fatal — page still has HTML
          }
        }

        const page: CrawlPage = {
          success: fetchResult.success,
          url: fetchResult.url,
          statusCode: fetchResult.statusCode,
          tierUsed: fetchResult.tierUsed,
          html: fetchResult.html,
          structuredData,
          artifactId: fetchResult.artifactId,
          error: fetchResult.error,
          get ok() { return fetchResult.success && fetchResult.error === null; },
        };
        pages.push(page);
        if (page.ok) fetched++; else failed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        pages.push({
          success: false,
          url: node.url,
          statusCode: 0,
          tierUsed: 0,
          html: null,
          structuredData: null,
          artifactId: null,
          error: errMsg,
          get ok() { return false; },
        });
        failed++;
      }
    }

    return {
      success: true,
      url,
      totalPagesDiscovered: crawlResult.totalPages,
      pagesFetched: fetched,
      pagesFailed: failed,
      pages,
      crawlArtifactId: crawlResult.artifactId,
      error: null,
    };
  }

  async *crawlStream(url: string, opts: CrawlOrchestratorOptions = {}): AsyncIterable<CrawlProgressEvent> {
    yield { type: 'discovery_started', url, page: null, total: null, success: null, error: null, metadata: {} };

    const crawlResult = await this.webgrph.crawl(url, {
      maxDepth: opts.maxDepth ?? 3,
      maxPages: opts.maxPages ?? 100,
      includeExternalLinks: opts.includeExternalLinks ?? false,
      ...(opts.sessionArtifactId && { sessionArtifactId: opts.sessionArtifactId }),
    });

    const total = crawlResult.totalPages;
    yield { type: 'discovery_complete', url, page: null, total, success: null, error: null, metadata: { pagesFound: total } };

    const pages: CrawlPage[] = [];
    let fetched = 0;
    let failed = 0;

    for (let i = 0; i < crawlResult.pages.length; i++) {
      const node = crawlResult.pages[i]!;
      const pageNum = i + 1;

      yield { type: 'page_fetching', url: node.url, page: pageNum, total, success: null, error: null, metadata: {} };

      try {
        const fetchResult = await this.evadr.fetch(node.url, {
          ...(opts.sessionArtifactId && { sessionArtifactId: opts.sessionArtifactId }),
        });

        let structuredData: Record<string, unknown> | null = null;
        if (opts.extractSchema && fetchResult.ok) {
          try {
            const extraction = await this.kolektr.page(node!.url, {
              schema: opts.extractSchema,
              ...(fetchResult.artifactId && { fetchArtifactId: fetchResult.artifactId }),
            });
            structuredData = extraction.records.length > 0
              ? extraction.records[0] ?? null
              : null;
          } catch {
            // Extraction failure is non-fatal
          }
        }

        const page: CrawlPage = {
          success: fetchResult.success,
          url: fetchResult.url,
          statusCode: fetchResult.statusCode,
          tierUsed: fetchResult.tierUsed,
          html: fetchResult.html,
          structuredData,
          artifactId: fetchResult.artifactId,
          error: fetchResult.error,
          get ok() { return fetchResult.success && fetchResult.error === null; },
        };
        pages.push(page);

        if (page.ok) {
          fetched++;
          yield { type: 'page_fetched', url: node.url, page: pageNum, total, success: true, error: null, metadata: { tierUsed: fetchResult.tierUsed } };
        } else {
          failed++;
          yield { type: 'page_failed', url: node.url, page: pageNum, total, success: false, error: fetchResult.error, metadata: {} };
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        pages.push({
          success: false,
          url: node.url,
          statusCode: 0,
          tierUsed: 0,
          html: null,
          structuredData: null,
          artifactId: null,
          error: errMsg,
          get ok() { return false; },
        });
        failed++;
        yield { type: 'page_failed', url: node.url, page: pageNum, total, success: false, error: errMsg, metadata: {} };
      }
    }

    const result: SiteCrawlResult = {
      success: true,
      url,
      totalPagesDiscovered: total,
      pagesFetched: fetched,
      pagesFailed: failed,
      pages,
      crawlArtifactId: crawlResult.artifactId,
      error: null,
    };

    yield { type: 'crawl_complete', url, page: null, total, success: true, error: null, metadata: { result } };
  }

  toString(): string {
    return `Kloakd(organizationId=${this._transport._organizationId}, baseUrl=${this._transport._baseUrl})`;
  }
}
