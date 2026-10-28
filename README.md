# kloakd-sdk

The official TypeScript/JavaScript SDK for the [KLOAKD](https://kloakd.dev) API.

- Node.js 18 or later (it uses the built-in `fetch`), or a modern browser.
- ESM and CommonJS builds with TypeScript types.

```bash
npm install kloakd-sdk
```

## Quick start

```typescript
import { Kloakd } from 'kloakd-sdk';

const client = new Kloakd({
  apiKey: process.env.KLOAKD_API_KEY!,
  organizationId: process.env.KLOAKD_ORG_ID!,
});

// Fetch a page (anti-bot handling is automatic).
const page = await client.evadr.fetch('https://example.com');
if (page.ok) console.log(page.statusCode, page.tierUsed, page.html?.length);
if (page.authRequired) console.log('Login needed; discovery', page.discoveryId);

// Extract structured data.
const extraction = await client.kolektr.page('https://books.toscrape.com', {
  schema: { title: 'css:h3 a', price: '.price_color' },
});
console.log(extraction.records);
```

## Options

| Option | Default | |
|---|---|---|
| `apiKey` | required | Your API key. |
| `organizationId` | required | Your organisation id. |
| `baseUrl` | `https://api.kloakd.dev` | |
| `timeout` | `100` | Per-request timeout in **seconds**. Above the API's 85 s synchronous wait, so a long request gets the API's 202 hand-off instead of timing out. Event streams have no timeout. |
| `maxRetries` | `3` | Retries of a failed request (see below). |

## Long requests (202 hand-off)

A synchronous route still running after about 85 s answers 202 and keeps
working as a job. These methods follow the job and return the same result
as a direct answer: `evadr.fetch`, `kolektr.page` / `pageAll`,
`fetchyr.authenticate`, `detectForms`, `fillForm`, `detectMfa`,
`nexus.analyze`, `synthesize`, `execute`. Each takes `pollIntervalMs`
(default 3000, backing off to 15 s) and `pollTimeoutMs` (default 15 minutes).

When the wait runs out the SDK throws `JobTimeoutError`; its `jobId` lets you
resume:

```typescript
import { JobTimeoutError } from 'kloakd-sdk';

try {
  await client.kolektr.page(url, { pollTimeoutMs: 60_000 });
} catch (e) {
  if (e instanceof JobTimeoutError) {
    const result = await client.waitForHandoff(e.jobId);   // or client.getHandoff(e.jobId)
  }
}
```

A fetch handed off by `evadr.fetch` is resumed with `client.evadr.waitForJob(jobId)`.

## Crawling

```typescript
// Discover a site's pages (waits for the crawl to finish).
const crawl = await client.webgrph.crawl('https://example.com', { maxPages: 50 });
console.log(crawl.status, crawl.totalPages, crawl.pages.map((p) => p.url));

// Discover, fetch and extract every page.
const site = await client.crawl('https://example.com', {
  maxPages: 20,
  extractSchema: { title: 'css:h1' },
});
for (const p of site.pages) if (p.ok) console.log(p.url, p.structuredData);
```

`maxDepth` and `maxPages` are optional; unset, the API uses your tier's
defaults. `client.crawl` records a page that fails on that page, but stops
and throws on payment, quota, billing, entitlement, authentication and
rate-limit errors. `client.crawlStream` yields the same work as progress
events (`discovery_started`, `discovery_complete`, `page_fetching`,
`page_fetched`, `page_failed`, `crawl_complete`); these are made by the SDK.

`client.webgrph.crawlStream(url)` streams the API's own pipeline events
(`eventType`, `stageId`, `status`, `message`, `progressPct`, `metadata`,
`error`, `sequence`, plus `crawlId`).

## Extraction schemas

`schema` (and `extractSchema`) accepts:

- the shorthand `{ field: 'css:selector' }` (the `css:` prefix is optional);
- a list of fields: `[{ name: 'title', selector: 'h1', attribute: 'title', type: 'text' }]`;
- the full spec: `{ fields: [...], pagination: true, maxPages: 5 }`.

## Chat (Parlyr)

```typescript
const turn = await client.parlyr.chat('session-1', 'Get the products from example.com');
console.log(turn.response, turn.interpretation, turn.results);
if (!turn.ok) console.error(turn.errors);

for await (const event of client.parlyr.chatStream('session-1', 'Now only the ones under $20')) {
  console.log(event.type, event.content, event.data);
}
```

Event types: `thinking`, `interpretation`, `progress`, `results`, `error`,
`warning`, `auth_required`, `mfa_required`, `clarification`, `export_ready`,
`text`.

## Modules

| Namespace | Methods |
|---|---|
| `evadr` | `fetch`, `fetchAsync`, `waitForJob`, `fetchStream`, `getJob`, `jobEvents`, `analyze`, `scan`, `profile`, `listVendors`, `listProxies`, `storeProxy`, `deleteProxy` |
| `webgrph` | `startCrawl`, `crawl`, `crawlAll`, `crawlStream`, `getCrawlStatus`, `cancelCrawl`, `crawlEvents`, `getCrawlPages`, `crawlAllPages`, `readerView`, `detectedApis`, `listSessions`, `saveSession`, `getSession`, `deleteSession`, `endSession`, `updateSessionJob` |
| `skanyr` | `listSites`, `siteFromCrawl`, `getSite`, `updateSite`, `deleteSite`, `sync`, `exportSite`, `getSiteApis`, `getSiteResources`, `searchSite`, `getFindings`, `getTechnologies`, `getTechnologyEvidence`, `listSnapshots`, `getTimeline`, `getTimelineSnapshot`, `diff`, `getGraph`, `getGraphStats`, `getSubgraph`, `listResources`, `getResource`, `search`, `extract`, `getExtractionText`, `getExtractionStructure` |
| `nexus` | `analyze`, `synthesize`, `verify`, `execute`, `knowledge`, `reason` |
| `parlyr` | `parse`, `chat`, `chatStream`, `deleteSession` |
| `fetchyr` | `storeCredentials`, `listCredentials`, `deleteCredentials`, `authenticate`, `listSessions`, `invalidateSession`, `terminateSession`, `createWorkflow`, `listWorkflows`, `getWorkflow`, `updateWorkflow`, `deleteWorkflow`, `getWorkflowStatistics`, `executeWorkflow`, `getExecution`, `resumeExecution`, `createMultiSiteWorkflow`, `detectForms`, `fillForm`, `detectMfa`, `submitMfa`, `listMfaChallenges`, `getMfaChallenge`, `getMfaStatistics`, `checkDuplicate`, `createDedupSession`, `listDedupSessions`, `getDedupSession`, `getDedupSessionStatistics`, `getDedupDomainStatistics`, `discoverAuthChain`, `getAuthChainStatus`, `resumeAuthChainCredentials`, `resumeAuthChainMfa` |
| `kolektr` | `page`, `pageAll`, `extractHtml`, `getApiData`, `getApiDataPaginated`, `extractAllApiData`, `listContent`, `getContent`, `deleteContent`, `listJobs`, `getJob`, `getJobStatus`, `listScrapers`, `createScraper`, `getScraper`, `updateScraper`, `deleteScraper` |
| client | `crawl`, `crawlStream`, `getHandoff`, `waitForHandoff` |

`ROUTES.md` lists the API route behind each call.

## Errors

Every error extends `KloakdError` (`statusCode`, `message`, `code`: the API's error code).

| Error | When |
|---|---|
| `AuthenticationError` | 401: invalid or expired API key. |
| `PaymentRequiredError` | 402 `payment_required`: the last payment failed. |
| `NotEntitledError` | 403 `not_entitled` (`module`) or `tier_access_denied` (`feature`, `currentTier`, `requiredTier`); `upgradeUrl`. |
| `ForbiddenError` | Any other 403. `NotEntitledError` extends it. |
| `ConcurrencyLimitError` | 409 `concurrent_limit`: too many crawls running (`concurrentLimit`, `activeCrawls`, `tier`). |
| `RateLimitError` | 429 `rate_limited` (`retryAfter`, `resetAt`). `quotaExhausted` is true for the playground quota (`quotaUsed`, `quotaLimit`, `upgradeUrl`). |
| `QuotaExceededError` | 429 `gb_exhausted`: the plan's GB are used up (`tier`, `upgradeUrl`). |
| `BillingUnavailableError` | 503 `billing_unavailable`: usage could not be checked; nothing was started. |
| `UpstreamError` | 502. |
| `ApiError` | Any other error status. A 422 carries the API's validation messages. |
| `JobFailedError` | A handed-off job failed or expired (`jobId`). |
| `JobTimeoutError` | A job was still running when the wait ran out (`jobId`). |

### Retries

- 429 `rate_limited`: retried on any method after `Retry-After` (or the body's
  `retry_after`, or until `reset_at`); the playground quota is not retried.
- 503 `billing_unavailable`: retried on any method after `Retry-After`.
- Other 5xx and network errors: retried for GET, HEAD and DELETE only, with
  exponential backoff (1 s, 2 s, 4 s, … at most 60 s). POST, PUT and PATCH
  are not retried, since the API may already have done the work.
- Nothing else is retried.

## License

MIT
