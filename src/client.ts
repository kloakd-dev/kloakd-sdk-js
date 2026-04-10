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
 * const fetch = await client.evadr.fetch('https://books.toscrape.com');
 * const data  = await client.kolektr.page('https://books.toscrape.com', {
 *   schema: { title: 'css:h3 a', price: 'css:p.price_color' },
 *   fetchArtifactId: fetch.artifactId ?? undefined,
 * });
 * console.log(data.records.slice(0, 3));
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

  toString(): string {
    return `Kloakd(organizationId=${this._transport._organizationId}, baseUrl=${this._transport._baseUrl})`;
  }
}
