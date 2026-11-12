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

// Extract structured data: one record per book on the list page.
const extraction = await client.kolektr.page('https://books.toscrape.com', {
  schema: { title: { selector: 'h3 a', attribute: 'title' }, price: '.price_color' },
  itemSelector: 'article.product_pod',
});
console.log(extraction.records); // [{ title: 'A Light in the Attic', price: '£51.77' }, ...]
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
`nexus.analyze`, `synthesize`. Each takes `pollIntervalMs`
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

// One record per item on each page: every record is in p.records.
const lists = await client.crawl('https://books.toscrape.com', {
  maxPages: 5,
  extractSchema: { title: 'css:h3 a', price: '.price_color' },
  extractItemSelector: 'article.product_pod',
});
```

`maxDepth` and `maxPages` are optional; unset, they are not sent and the API
uses your tier's defaults. `client.crawl` records a page that fails on that page, but stops
and throws on payment, quota, billing, entitlement, authentication and
rate-limit errors. `client.crawlStream` yields the same work as progress
events (`discovery_started`, `discovery_complete`, `page_fetching`,
`page_fetched`, `page_failed`, `crawl_complete`); these are made by the SDK.

### Held, partial and continued crawls

A crawl can end three ways that are not a failure:

```typescript
const crawl = await client.webgrph.crawl('https://example.com');

if (crawl.held) {
  // Status held_quota: the plan has no quota left. The crawl is paused, not
  // failed, and resumes under the same id when quota returns.
  console.log(crawl.message);
  const later = await client.webgrph.waitForCrawl(crawl.crawlId); // after a top-up or upgrade
} else if (crawl.isPartial && crawl.resumable) {
  // It stopped at its time budget with pages left.
  console.log(crawl.partialReason, crawl.pagesFetched, 'of', crawl.pagesDiscovered);
  await client.webgrph.continueCrawl(crawl.crawlId);              // 202
  const rest = await client.webgrph.waitForCrawl(crawl.crawlId);
}
```

- **Held** (`held` true, `status` `held_quota`): returned at once, never
  thrown, with `ok` false, `error` null and no pages loaded. `crawlAll`
  yields no pages; `client.crawl` returns a `SiteCrawlResult` with `held`
  true and fetches nothing. If quota does not return within 30 days the
  crawl ends `failed` (`errorCode` `held_quota_expired`), and the wait
  throws `JobFailedError` like any failed crawl.
- **Partial** (`isPartial` true): the crawl stopped before asking for every
  page it found; `partialReason` is `time_budget`, `max_pages` or `error`.
  `pagesDiscovered`, `pagesFetched` and `pagesUnfetched` say what it covered.
  These are null until the crawl has reported them.
- **Continue**: `continueCrawl` works only when `resumable` is true. Any
  other crawl (not resumable, still running, already continuing, unknown) is
  a 409 `ApiError`.

Each `PageNode` has `fetchStatus` (`fetched`, `unfetched` or `not_requested`)
and `fetchError`.

### Crawl pages

`client.webgrph.getCrawlPages(crawlId, { cursor, limit, includeGrouping })`
returns one page of the crawl's tree; pass `nextCursor` back for the next, or
call `crawlAllPages(crawlId, { limit, includeGrouping })` for all of them.

- `limit` is 1–1000 (the SDK sends 500 when unset; the API's own default is
  100). Outside that range the SDK throws `RangeError` before sending.
- A cursor that is not the API's `nextCursor` (a non-negative integer) is a 422.
- By default only fetched pages are listed, each under the page the crawl found
  it on, and `total` matches the crawl's `totalPages`. `includeGrouping: true`
  also lists the tree's display-only grouping folders (`isGrouping` true on
  those nodes); they were never fetched. `webgrph.crawl(url, { includeGrouping: true })`
  loads its pages that way.
- `totalPages` and `maxDepthReached` on a crawl count fetched pages only.

```typescript
const { nodes, nextCursor, total } = await client.webgrph.getCrawlPages(crawlId, { limit: 1000 });
const tree = await client.webgrph.crawlAllPages(crawlId, { includeGrouping: true });
const folders = tree.filter((n) => n.isGrouping);
```

`client.webgrph.crawlStream(url)` streams the API's own pipeline events
(`eventType`, `stageId`, `status`, `message`, `progressPct`, `metadata`,
`error`, `sequence`, plus `crawlId`).

## Crawl, extract and download

One job crawls a site, extracts every page and keeps the rows for download.
It needs a plan with Kolektr, and a live key (a test key is refused).

```typescript
const job = await client.webgrph.startCrawlExtract('https://shop.example/', {
  maxPages: 200,
  extract: { fields: ['title', 'price'] },
});

const done = await client.webgrph.waitForCrawlExtract(job.jobId);
console.log(done.status, done.progress.items, done.shapes);

// Rows, 100 a page by default (1–1000), following next_cursor:
for await (const row of client.webgrph.iterCrawlExtractResults(job.jobId, { kind: 'item' })) {
  console.log(row.pageUrl, row.data);
}

// The whole set as a file (json, ndjson or csv), streamed to disk:
const saved = await client.webgrph.downloadCrawlExtract(job.jobId, 'rows.csv', { format: 'csv' });
console.log(saved.bytes, saved.jobStatus);
```

`crawlExtract(url, options)` starts the job and waits for it; a failed job
throws `JobFailedError`, a cancelled one is returned, and so is one whose
crawl is held for quota (`held` true; wait again with `waitForCrawlExtract`
when quota returns). The status has a `crawl` object saying what the crawl
covered (`status`, `isPartial`, `partialReason`, `pagesDiscovered`,
`pagesFetched`, `pagesUnfetched`, `cancelled`, `rootUnfetched`).
`exportCrawlExtract` returns the response body as a `ReadableStream` (`body`,
`contentType`, `filename`, `jobStatus`, `crawl`) for runtimes without a file
system; `downloadCrawlExtract` needs Node. An export of a job that is still
running, or that failed, holds the rows written so far: check `jobStatus`,
and `crawl.isPartial` for a crawl that did not cover the whole site (`crawl`
is read from the `X-Crawl-*` headers; a value the API left out is null).
`getCrawlExtractPages` lists each page with its status and method;
`cancelCrawlExtract` stops a job (409 once it has ended). Exports have no
per-request timeout.

`client.exportBatchJob(batchJobId, { format })` and
`client.downloadBatchJob(batchJobId, path, { format })` do the same for a
batch job's results. The batch export does not say the job's state:
`jobStatus` and `crawl` are null there.

## Batch jobs

A batch extracts a list of URLs, one item per URL, and holds one work slot
until it ends. It needs a live key (a test key is refused with 403).

```typescript
const batch = await client.createBatchJob(
  ['https://shop.example/p/1', 'https://shop.example/p/2'],
  { entityType: 'products', fields: ['name', 'price'] },
);

await client.pauseBatchJob(batch.id);   // items already running finish; the rest wait
await client.resumeBatchJob(batch.id);  // the waiting items are queued again, each once
const state = await client.getBatchJob(batch.id);  // status, totalItems, completedItems, message

const page = await client.getBatchJobResults(batch.id, { limit: 100, offset: 0 });
for (const item of page.results) console.log(item.url, item.status, item.extractedData);

await client.cancelBatchJob(batch.id);  // items not yet ended are cancelled; finished ones keep their results
```

- `status` is `pending`, `running`, `paused`, `held_quota`, `completed`,
  `failed` or `cancelled`. Only a running batch can be paused, only a
  paused one resumed, and a batch that has completed or failed cannot be
  cancelled: the API answers 409 and the SDK throws `ApiError` with `code`
  `invalid_batch_transition` (the message names the batch's status).
- Repeating a call is not an error: pausing a paused batch, resuming a
  running one and cancelling a cancelled one answer the batch as it is.
- `resumeBatchJob` can throw a 503 `ApiError` with `code` `dispatch_failed`:
  the items could not be queued and the batch is paused again, so call it
  again. `createBatchJob` throws the same when the batch could not be
  queued; nothing was started. Neither is retried by the SDK.
- Creating or resuming over the plan's running batches throws
  `ConcurrencyLimitError`; more URLs than the plan's page limit is a 413
  `ApiError` with `code` `batch_too_large`.
- `listBatchJobs({ page, pageSize })` lists the organisation's batches,
  newest first. `exportBatchJob` and `downloadBatchJob` (above) give the
  rows as a file.

## Unified scrape

`client.unifiedScrape(url, opts)` lets the API choose how to scrape a URL:
level 1 (direct extraction) or level 2 (the Strategy Engine), escalating
when the first fails. It needs a live key whose plan has Kolektr and Nexus
(403 `test_key_not_allowed` or `module_not_entitled` otherwise).

```typescript
const scrape = await client.unifiedScrape('https://shop.example/list', {
  prompt: 'product names and prices',
  mode: 'auto',                      // or 'level1', 'level2'
  schema: { name: 'product name', price: 'price' },
});
if (scrape.authRequired) {
  // The URL is behind a login: nothing was scraped. scrape.discoveryId names the auth-chain discovery.
} else if (scrape.status === 'failed') {
  // The scrape failed. success is still true and there is no error text;
  // jobId names no stored job (getUnifiedScrape would be a 404).
} else {
  const job = await client.getUnifiedScrape(scrape.jobId);  // status, level, progress, result, escalationPath
}
```

Check `status`: when the scrape fails the API still answers with `success`
true and `status` `'failed'`, without the error text, and that answer's
`jobId` names no stored job, so `getUnifiedScrape` on it is a 404
(`ApiError`).

Options: `prompt`, `mode`, `schema`, `options`, `context`, `constraints`,
`sessionArtifactId` (a login session), and `pollIntervalMs` /
`pollTimeoutMs` for a request the API hands off (202), which is followed
like every other long request.

## Login sessions

To crawl or fetch behind a login, create a session and pass its id as
`sessionArtifactId`.

```typescript
// From cookies exported from your own browser: ready at once (201).
const session = await client.fetchyr.startLoginSession('https://site.example/account', {
  method: 'cookies',
  cookies: [{ name: 'sid', value: process.env.SITE_SID!, domain: '.site.example' }],
  userAgent: 'Mozilla/5.0 ...', // the user agent of the browser the cookies came from
});
console.log(session.status, session.sessionArtifactId, session.cookiesKept, session.cookiesDropped);

// Or interactively (the default): the API answers 202 with what to do next.
const started = await client.fetchyr.startLoginSession('https://site.example/account');
console.log(started.status, started.discoveryId, started.next);

// A session lives 8 hours. Is it still usable?
const state = await client.fetchyr.getSession(session.sessionArtifactId!);
if (state.status === 'paused') {
  console.log(state.pauseReason, state.pauseMessage);
  await client.fetchyr.resumeSession(state.artifactId); // 409 if it is not paused, or the site signed it out
}
```

## Extraction schemas

`schema` (and `extractSchema`) accepts:

- the shorthand `{ field: 'css:selector' }` (the `css:` prefix is optional);
- a list of fields: `[{ name: 'title', selector: 'h1', attribute: 'title', type: 'text' }]`;
- the full spec: `{ fields: [...], itemSelector: 'li.item', pagination: true, maxPages: 5 }`.

A shorthand value may also be `{ selector, attribute, type }`:
`{ link: { selector: 'a', attribute: 'href' }, tags: { selector: '.tag', type: 'list' } }`.

### One record per item: `itemSelector`

On a list page, `itemSelector` (CSS, sent as `schema_spec.item_selector`) makes
one record per element it matches, and each field's selector is read inside
that element:

- the first match gives the value; a field with `type: 'list'` gives every match;
- `attribute` reads that attribute instead of the text;
- a field with no match in an item is `null`;
- a field without a selector is read from the item element itself.

```typescript
const { records } = await client.kolektr.page('https://books.toscrape.com', {
  schema: {
    title: { selector: 'h3 a', attribute: 'title' },
    price: 'css:p.price_color',
    link: { selector: 'h3 a', attribute: 'href' },
  },
  itemSelector: 'article.product_pod',
});
// 20 records, one per book.
```

It works with every schema form, with `kolektr.extractHtml(html, url, { schema, itemSelector })`,
and as `extractItemSelector` in `client.crawl`. Without it the response is
unchanged: the field selectors run against the whole page and give one record.
The SDK throws before sending for an empty item selector, or one with no
schema or no fields; the API answers invalid CSS with a 422 (`ApiError`).

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
| `webgrph` | `startCrawl`, `crawl`, `crawlAll`, `crawlStream`, `getCrawlStatus`, `waitForCrawl`, `continueCrawl`, `cancelCrawl`, `crawlEvents`, `getCrawlPages`, `crawlAllPages`, `startCrawlExtract`, `crawlExtract`, `getCrawlExtract`, `waitForCrawlExtract`, `getCrawlExtractResults`, `iterCrawlExtractResults`, `crawlExtractAllResults`, `getCrawlExtractPages`, `exportCrawlExtract`, `downloadCrawlExtract`, `cancelCrawlExtract`, `readerView`, `detectedApis`, `listSessions`, `saveSession`, `getSession`, `deleteSession`, `endSession`, `updateSessionJob` |
| `skanyr` | `listSites`, `siteFromCrawl`, `getSite`, `updateSite`, `deleteSite`, `sync`, `exportSite`, `getSiteApis`, `getSiteResources`, `searchSite`, `getFindings`, `getTechnologies`, `getTechnologyEvidence`, `listSnapshots`, `getTimeline`, `getTimelineSnapshot`, `diff`, `getGraph`, `getGraphStats`, `getSubgraph`, `listResources`, `getResource`, `search`, `extract`, `getExtractionText`, `getExtractionStructure` |
| `nexus` | `analyze`, `synthesize`, `verify`, `reason` |
| `parlyr` | `parse`, `chat`, `chatStream`, `deleteSession` |
| `fetchyr` | `storeCredentials`, `listCredentials`, `deleteCredentials`, `authenticate`, `startLoginSession`, `getSession`, `resumeSession`, `listSessions`, `invalidateSession`, `terminateSession`, `createWorkflow`, `listWorkflows`, `getWorkflow`, `updateWorkflow`, `deleteWorkflow`, `getWorkflowStatistics`, `executeWorkflow`, `getExecution`, `resumeExecution`, `createMultiSiteWorkflow`, `detectForms`, `fillForm`, `detectMfa`, `submitMfa`, `listMfaChallenges`, `getMfaChallenge`, `getMfaStatistics`, `checkDuplicate`, `createDedupSession`, `listDedupSessions`, `getDedupSession`, `getDedupSessionStatistics`, `getDedupDomainStatistics`, `discoverAuthChain`, `getAuthChainStatus`, `resumeAuthChainCredentials`, `resumeAuthChainMfa` |
| `kolektr` | `page`, `pageAll`, `extractHtml`, `getApiData`, `getApiDataPaginated`, `extractAllApiData`, `listContent`, `getContent`, `deleteContent`, `listJobs`, `getJob`, `getJobStatus`, `listScrapers`, `createScraper`, `getScraper`, `updateScraper`, `deleteScraper` |
| client | `crawl`, `crawlStream`, `getHandoff`, `waitForHandoff`, `createBatchJob`, `getBatchJob`, `listBatchJobs`, `getBatchJobResults`, `pauseBatchJob`, `resumeBatchJob`, `cancelBatchJob`, `exportBatchJob`, `downloadBatchJob`, `unifiedScrape`, `getUnifiedScrape` |

`ROUTES.md` lists the API route behind each call.

## Errors

Every error extends `KloakdError` (`statusCode`, `message`, `code`: the API's error code).

| Error | When |
|---|---|
| `AuthenticationError` | 401: invalid or expired API key. |
| `PaymentRequiredError` | 402 `payment_required`: the last payment failed. |
| `NotEntitledError` | 403 `not_entitled` (`module`) or `tier_access_denied` (`feature`, `currentTier`, `requiredTier`); `upgradeUrl`. |
| `ForbiddenError` | Any other 403. `NotEntitledError` extends it. |
| `ConcurrencyLimitError` | 409 `concurrent_limit`: every work slot is in use (`tier`, `concurrentLimit`, `activeCrawls`, `activeRequests`). Not retried. |
| `RateLimitError` | 429 `rate_limited` (`retryAfter`, `resetAt`). `quotaExhausted` is true for the playground quota (`quotaUsed`, `quotaLimit`, `upgradeUrl`). |
| `QuotaExceededError` | 429 `gb_exhausted`: the plan's GB are used up (`tier`, `upgradeUrl`). |
| `BillingUnavailableError` | 503 `billing_unavailable`: usage could not be checked; nothing was started. |
| `UpstreamError` | 502. |
| `ApiError` | Any other error status. A 422 carries the API's validation messages. `code` holds the API's error code, for example 409 `invalid_batch_transition` and 503 `dispatch_failed` on the batch calls. |
| `JobFailedError` | A handed-off job failed or expired (`jobId`). |
| `JobTimeoutError` | A job was still running when the wait ran out (`jobId`). |

### Retries

- 429 `rate_limited`: retried on any method after `Retry-After` (or the body's
  `retry_after`, or until `reset_at`); the playground quota is not retried.
- 503 `billing_unavailable`: retried on any method after `Retry-After`.
- Other 5xx and network errors: retried for GET, HEAD and DELETE only, with
  exponential backoff (1 s, 2 s, 4 s, … at most 60 s). POST, PUT and PATCH
  are not retried, since the API may already have done the work.
- Nothing else is retried, including 409 `concurrent_limit`.

### Work slots (concurrency)

Every metered call holds one of your organisation's work slots while it runs;
crawls and batches hold one until they finish. Slots per plan: Free 2,
Starter 5, Pro 10, Pro+ 20, Developer 50, Enterprise 100. A call over the
limit is refused with 409 `concurrent_limit` and nothing is started:

```typescript
import { ConcurrencyLimitError } from 'kloakd-sdk';

try {
  await client.kolektr.page(url, { schema });
} catch (err) {
  if (err instanceof ConcurrencyLimitError) {
    // e.g. tier 'free', 2 slots: 1 crawl or batch running, 1 other request in flight
    console.log(err.tier, err.concurrentLimit, err.activeCrawls, err.activeRequests);
  }
}
```

## License

MIT
