# Changelog

All notable changes to the KLOAKD TypeScript/JavaScript SDK are documented here.
Only 0.1.0 and 0.4.0 were published to npm before 0.5.0; 0.2.0 and 0.3.0 were never released there.

## [Unreleased]

For the API on kobe-scraper main (6bd19e9b). **Breaking**: two methods and
several fields the API never sent are removed, so the next release is 0.7.0.

### Fixed
- `skanyr.getExtractionText` returns the extraction's text as a `string`.
  The API answers `text/plain`; the method read it as JSON and always
  returned `{}`. **Breaking** for code typed against the old
  `Record<string, unknown>` return.
- A crawl held for quota (status `held_quota`) no longer runs the wait to
  its timeout. `webgrph.crawl`, `webgrph.waitForCrawl`, `webgrph.crawlAll`,
  `client.crawl` and `client.crawlStream` return at once: `held` is true,
  `status` is `held_quota`, `message` says what to do, `error` is null and
  no pages are loaded. A held crawl is paused, not failed: it resumes under
  the same id when quota returns, and ends `failed` with error code
  `held_quota_expired` after 30 days. `waitForCrawlExtract` and
  `crawlExtract` return the same way when the job's crawl is held
  (`CrawlExtractStatus.held`).
- `nexus.reason` sends `timeout_secs` when `timeoutSecs` is 0.
- `ExportDownload.jobStatus` and `SavedExport.jobStatus` are documented as
  null for a batch export: the batch export sends no `X-Job-Status`.

### Removed
- `PageNode.statusCode` and `PageNode.crawlParentUrl`: the pages route never
  sent them (they were always null). `parentUrl` is the page the crawl found
  the node on; `fetchStatus` and `fetchError` say whether it was fetched.
- `ExtractionResult.hasMore` and `ExtractionResult.total` (always false and
  0), and `ExtractionResult` no longer extends `Paginated`. Use
  `totalRecords`.
- `error` on `NexusAnalyzeResult`, `NexusSynthesisResult` and
  `NexusVerifyResult` (always null). A failed call throws; `ok` is true for
  an analysis or synthesis that returned, and `verified` for a verification.
- `nexus.execute` and `NexusExecuteResult`: the API removed
  `POST nexus/execute`; the call could only fail.
- `nexus.knowledge` and `NexusKnowledgeResult`: the route now takes
  `{strategy_id, url, outcome}` (the old `{execution_result_id}` body is
  refused) and is not part of the public API reference.

### Added
- `webgrph.waitForCrawl(crawlId, opts)`: wait for a crawl by id, for example
  one that was held, continued, or started with `wait: false`.
- `webgrph.continueCrawl(crawlId)`: fetch the rest of a crawl that stopped
  at its time budget (`resumable` true). Answers `CrawlContinueResult`; a
  crawl that cannot be continued is a 409 `ApiError`.
- `CrawlResult.held`, `message`, `errorCode`, `isPartial`, `partialReason`,
  `resumable`, `pagesDiscovered`, `pagesFetched`, `pagesUnfetched`.
  `SiteCrawlResult.crawlId`, `status`, `message`, `held`.
- `PageNode.fetchStatus` and `fetchError`.
- `CrawlExtractStatus.crawl` (`CrawlExtractCrawl`): what the job's crawl
  covered. `ExportDownload.crawl` and `SavedExport.crawl` (`ExportCrawl`):
  the same from the export's `X-Crawl-*` headers; null when none is sent.
- Login sessions (`fetchyr`): `startLoginSession(targetUrl, opts)`,
  `getSession(artifactId)`, `resumeSession(artifactId)`. Types
  `LoginSession`, `LoginSessionOptions`, `LoginCookie`, `SessionStatus`.
- `ExtractionResult.level`, `levelReason`, `loginOptions`.
- Crawl, extract and download in one job (`webgrph`): `startCrawlExtract`,
  `crawlExtract`, `getCrawlExtract`, `waitForCrawlExtract`,
  `getCrawlExtractResults`, `iterCrawlExtractResults`,
  `crawlExtractAllResults`, `getCrawlExtractPages`, `exportCrawlExtract`
  (stream), `downloadCrawlExtract` (file, Node only), `cancelCrawlExtract`.
  Types `CrawlExtractJob`, `CrawlExtractStatus`, `CrawlExtractRow`,
  `CrawlExtractResultsPage`, `CrawlExtractPage`, `CrawlExtractPagesPage`,
  `CrawlExtractCancelResult`, `CrawlExtractSpec`, `ExportFormat`,
  `ExportDownload`, `SavedExport`; `CRAWL_EXTRACT_MAX_LIMIT`.
- `client.exportBatchJob` and `client.downloadBatchJob`: a batch job's
  results as json, ndjson or csv.
- `NexusVerifyResult.status`, `riskScore`, `safetyChecks`,
  `verificationResultId`, `durationMs`.

### Changed
- Exports are streamed and sent without the per-request timeout.

## [0.6.0] — 2026-11-03

For the API deployed on 2 November 2026 (kobe-scraper 0bb0c6b5). Nothing is
removed; 0.5.0 code keeps working.

### Added
- `itemSelector` (GAP-API-11): one record per element on a list page, each
  field read inside it. On `kolektr.page` / `pageAll` / `extractHtml` options,
  on `SchemaSpec`, and as `extractItemSelector` in `client.crawl` /
  `crawlStream`. Sent as `schema_spec.item_selector`. `toSchemaSpec(schema,
  itemSelector?)` takes it as a second argument. An empty item selector, or
  one with no schema or no fields, throws before sending.
- Shorthand fields may be `{ selector, attribute, type }` as well as a
  selector string (`ShorthandField`); `ExtractHtmlOptions` type.
- `CrawlPage.records`: every extracted record of a page (`structuredData` is
  still the first).
- `webgrph.getCrawlPages(crawlId, { includeGrouping })` and
  `crawlAllPages(crawlId, { limit, includeGrouping })` (GAP-API-9/10);
  `webgrph.crawl(url, { includeGrouping })` loads its pages that way.
  `CrawlPagesOptions`, `CRAWL_PAGES_DEFAULT_LIMIT`, `CRAWL_PAGES_MAX_LIMIT`.
- `PageNode.isGrouping`, `parentUrl` and `crawlParentUrl` (the last only
  from stored page records; the pages listing does not send it).
- `ConcurrencyLimitError.activeRequests` (GAP-BILL-13): requests in flight
  when every work slot is in use.

### Changed
- `getCrawlPages` throws `RangeError` for a `limit` outside 1–1000 (the API
  answers 422). A cursor that is not a non-negative integer is now the API's
  422 (`ApiError`); it used to restart at 0.
- The API lists only fetched pages by default and counts only fetched pages
  in `total_pages` / `max_depth_reached`.
- `User-Agent: kloakd-sdk-js/0.6.0`.

### Documented
- Work slots per plan (Free 2, Starter 5, Pro 10, Pro+ 20, Developer 50,
  Enterprise 100); 409 `concurrent_limit` is not retried.

## [0.5.0] — 2026-10-28

### Breaking
- Default `timeout` is 100 s (was 60 s); it is in seconds. 100 s is above the API's 85 s synchronous wait, so a long request receives the 202 hand-off, which the SDK follows, instead of timing out.
- POST, PUT and PATCH are no longer retried on 5xx or network errors (the API may have done the work). GET, HEAD and DELETE still are. 429 `rate_limited` and 503 `billing_unavailable` are retried on any method; a 429 with `retry_after` 0 and no `reset_at` (the playground quota) is not retried.
- A 403 is `NotEntitledError` only for `not_entitled` and `tier_access_denied`; any other 403 is the new `ForbiddenError` (`NotEntitledError` extends it).
- `parlyr.chat` returns `{sessionId, response, intent, interpretation, clarificationNeeded, results, errors, warnings, events, ok}`, read from the API's real events. `confidence`, `tier`, `entities` and `requiresAction` are gone (the chat stream never carried them); `intent` is `string | null` (the API's interpretation data has no intent key today). `error` events are in `errors` and make `ok` false.
- `parlyr.chatStream` yields `{type, content, data, actions, timestamp}` (was `{event, data}`) and stops at `end`.
- `ChatEvent`, `FetchEvent` and `CrawlEvent` follow the API: `FetchEvent` is `{type, stageId, status, message, progressPct, metadata, error, sequence, tierUsed, artifactId}` (`tier` and `vendor` are gone); `CrawlEvent` is a `PipelineEvent` (`eventType, stageId, status, message, progressPct, metadata, error, sequence`) plus `crawlId` (`type`, `url`, `depth`, `pagesFound` are gone).
- `nexus.reason(queryType, parameters)`: `parameters` is `string[]` (was an object).
- `skanyr.updateSite(siteId, policy)`: `policy` is a string (was `{ policy: object }`).
- `skanyr.exportSite` returns the ZIP as `Uint8Array` (was a parsed JSON object, always empty).
- `skanyr.listResources`, `getSiteResources`, `getSiteApis`, `getFindings` and `getTechnologies` are typed as arrays, as the API returns them.
- `fetchyr.createMultiSiteWorkflow`: `dependencies` is a list of `SiteDependency` (`{dependentSite, dependencySite, dependencyType?, condition?, dataRequirements?, timeout?}`).
- `fetchyr.storeCredentials`: `extra` is `Record<string, string>`, as the API takes it.
- The extraction shorthand `{ field: "css:selector" }` sends the selector without `css:`.
- `client.crawl` / `crawlStream`: `outputFormat` is removed (it was never sent); `maxDepth` and `maxPages` are sent only when set, so the API applies the tier's defaults (was 3 and 100); the result's `success` and `error` are the crawl's; payment, quota, billing, entitlement, authentication and rate-limit errors stop the crawl and are thrown instead of being recorded on each page.
- `webgrph.startCrawl` / `crawl` send `max_depth` / `max_pages` only when set (was 3 and 100).
- `webgrph.listSessions` always sends `active_only` (default true, as the API).
- Path parameters are URL-encoded, including the `kolektr` api-data endpoint URL.

### Added
- `client.getHandoff(jobId)` and `client.waitForHandoff(jobId, opts)` (`GET handoff/{job_id}`), to resume a hand-off after `JobTimeoutError` (which carries `jobId`).
- `ConcurrencyLimitError` (409 `concurrent_limit`: `concurrentLimit`, `activeCrawls`, `tier`).
- `NotEntitledError.feature`, `currentTier`, `requiredTier` (from `tier_access_denied`); `KloakdError.code` (the API's error code).
- `RateLimitError.quotaUsed`, `quotaLimit`, `upgradeUrl`, `quotaExhausted`.
- `FetchResult` and `ExtractionResult`: `authRequired`, `discoveryId`.
- Extraction schemas may be a list of fields (`ExtractSchema`), also in `client.crawl`'s `extractSchema`.
- Paging: `kolektr.listJobs({page, limit, statusFilter})`, `listScrapers({page, pageSize, isTemplate})`, `listContent({page, pageSize, search})`, `fetchyr.listWorkflows({page, pageSize})`; `kolektr` api-data calls take `endpointHash`, and `extractAllApiData` `maxRecords`.
- `User-Agent: kloakd-sdk-js/0.5.0`; `USER_AGENT` export.
- README.md.

### Fixed
- A 422 keeps the API's validation messages (`detail[]`).
- A non-JSON error body (a proxy's HTML page) no longer crashes; its text is the message.
- Each retry gets its own timeout (one timeout covered every attempt).
- The package `exports` map lists `types` first.


## [0.4.0] — 2026-10-28

### Removed (breaking)
The API deleted these routes because they returned invented results, so their methods are gone:
- `nexus` recommendations (`nexus/recommendations/*`): `recommendAnalyze`, `listRecommendationApplications`, `getCacheStatistics`, `cleanupCache`, `invalidateCache`, `getHooksStatus`, `enableHook`, `disableHook`, `createPreference`, `getPreferences`, `updatePreference`, `deletePreference`, `getRecommendationStatistics`.
- `kolektr.createJob` (`POST kolektr/jobs`).
- `kolektr` job progress: `getJobProgress`, `getJobProgressSummary`, `getJobProgressEvents`, `getJobProgressLatest` (`GET kolektr/jobs/{id}/progress[...]`).
- `kolektr` progress phases: `listProgressPhases`, `getProgressPhase`, `getProgressPhaseSteps`, `getProgressSummary`.
- `kolektr` pipeline: `getPipelineStream`, `getPipelineEvents`.
- `webgrph.getJobTrends`, `webgrph.getErrorSummary`.
- `evadr.listProfiles` (`evadr.listVendors` remains).

These routes still exist but serve only the dashboard and are not part of the public API, so their methods are removed too: `webgrph.getDashboardSummary`, `getDiscoveryPatterns`, `getEfficiencyMetrics`, `getSiteMappingTrends`, `getUserBehaviorInsights`.

`kolektr.listJobs` and `kolektr.getJob` remain.

### Added
- Every synchronous route that can answer 202 after the API's time limit (about 85 s, below Cloudflare's 100 s) is followed to its result, returning the same typed result as a direct 200: `kolektr.page` / `pageAll` (`kolektr/extract`), `fetchyr.authenticate`, `detectForms`, `fillForm`, `detectMfa`, `nexus.analyze`, `synthesize`, `execute`, as `evadr.fetch` already was. The SDK polls the 202's `poll_url` (`…/handoff/{job_id}`; `…/evadr/jobs/{job_id}` for a fetch). A failed job throws `JobFailedError`, a job the API no longer has (404: unknown or expired after an hour) throws `JobFailedError`, and a job still running after `pollTimeoutMs` (default 15 minutes) throws `JobTimeoutError`. Each of these methods takes `pollIntervalMs` and `pollTimeoutMs` (type `HandoffOptions`).
- `NexusExecuteResult.executionResultId`: the id to pass to `nexus.knowledge()` (the API's `execution_result_id`, the same value as the result's artifact id; null when the API gives none).

### Changed
- Polling a handed-off job backs off: the first wait is `pollIntervalMs` (default 3 s), each later wait 1.5 times longer, at most 15 s. This applies to `evadr.fetch` and `evadr.waitForJob` too (0.3.0 polled at a fixed interval).
- `evadr.fetch` detects a hand-off by the HTTP 202 status as well as the body's `job_id` and `poll_url`, and follows `poll_url`.

## [0.3.0] — 2026-10-27 (not published to npm)

Every request is now a live API route: `tests/contract.test.ts` calls each
public method and checks it against the API's route list. The full table of
what changed per call is in `ROUTES.md`.

### Breaking
- `fetchyr.login(...)` is replaced by `fetchyr.authenticate(credentialName, targetUrl)` (credentials are stored first with `storeCredentials`).
- Removed, no API route: `fetchyr.fetch` (use `evadr.fetch(url, { sessionArtifactId })`), `fetchyr.getSession`, `webgrph.getHierarchy`, `webgrph.getJob`, and the skanyr discovery methods (`discover`, `discoverAll`, `discoverStream`, `getDiscovery`, `getDiscoveryEvents`, `analyzeBundle`, `discoverPageLive`, `hierarchy`, `expandNode`, `retry`, `health`, `getApiMap`, `getJob`).
- Moved from `skanyr` to `webgrph`: `readerView`, `detectedApis` and the session methods (`listSessions`, `saveSession`, `getSession`, `deleteSession`, `endSession`, `updateSessionJob`).
- `nexus.analyze(url, html, opts)` and `nexus.synthesize(url, html, goal)` take what the API requires; result fields follow the API (`verified`, `program`, `patterns`, …). `nexus.reason(queryType, parameters)`.
- `fetchyr.createWorkflow(name, steps, { description, workflowType })`, `executeWorkflow(workflowId, targetUrl, opts)`, `createMultiSiteWorkflow(name, sites, opts)`, `createDedupSession(name, opts)`, `submitMfa(challengeId, resolution)` (resolves via the MFA queue).
- `fetchyr.checkDuplicates(records)` is replaced by `checkDuplicate(url, { contentHash, sessionId })`.
- `evadr.scan(url)` takes only the URL; `evadr.getJobEvents` is replaced by `evadr.jobEvents` (an async iterable of SSE events).
- `webgrph.crawl` waits for the crawl to finish and returns its pages (the API answers 202 and crawls in the background); pass `{ wait: false }` for the id only.
- `kolektr` sends the schema as `schema_spec` (a `{ field: selector }` map still works); `pageAll` makes one request.

### Added
- `evadr.fetch` follows a synchronous fetch the API hands off as a job (202 after ~85 s, below Cloudflare's 100 s limit) to its result; `pollIntervalMs` and `pollTimeoutMs` options; `evadr.waitForJob`.
- Typed errors: `PaymentRequiredError` (402), `QuotaExceededError` (429 `gb_exhausted`, not retried), `RateLimitError` (429 `rate_limited`, honours `Retry-After`), `BillingUnavailableError` (503, retried after `Retry-After`), `JobFailedError`, `JobTimeoutError`. Error messages read the API's `detail` object.
- `evadr.profile`, `fetchyr.resumeExecution`, `fetchyr` auth-chain calls, `webgrph.startCrawl`, `cancelCrawl`, `crawlEvents`, `getCrawlPages` (cursor), `crawlAllPages`, and the skanyr site store (sites, sync, export, resources, search, findings, technologies, snapshots, timeline, diff, graph, extraction).

### Fixed
- Event streams were opened with `AbortSignal.timeout(0)` and so were cancelled at once; streams now stay open. GET event streams (job and crawl events) are supported.
- `fetchAsync` posted to the synchronous route with a stray `async` field; it uses `evadr/fetch/async`.

## [0.2.0] — 2026-05-13 (not published to npm)

### Added
- Full API coverage for all kernel module operations across 7 modules
- **Transport**: `put()` and `patch()` methods for full CRUD HTTP support
- **EvadrNamespace**: `scan`, `getJob`, `getJobEvents`, `listVendors`, `listProfiles`, `listProxies`, `deleteProxy`
- **FetchyrNamespace**: `storeCredentials`, `listCredentials`, `deleteCredentials`, `listSessions`, `terminateSession`, `fillForm`, `listMfaChallenges`, `getMfaChallenge`, `getMfaStatistics`, `listWorkflows`, `getWorkflow`, `updateWorkflow`, `deleteWorkflow`, `getWorkflowStatistics`, `createMultiSiteWorkflow`, `createDedupSession`, `listDedupSessions`, `getDedupSession`, `getDedupSessionStatistics`, `getDedupDomainStatistics`
- **KolektrNamespace**: `getApiData`, `getApiDataPaginated`, `extractAllApiData`, `listContent`, `getContent`, `deleteContent`, `listJobs`, `createJob`, `getJob`, `getJobStatus`, `getJobProgress`, `getJobProgressEvents`, `getJobProgressLatest`, `getJobProgressSummary`, `getPipelineEvents`, `getPipelineStream`, `listProgressPhases`, `getProgressPhase`, `getProgressPhaseSteps`, `getProgressSummary`, `listScrapers`, `createScraper`, `getScraper`, `updateScraper`, `deleteScraper`
- **NexusNamespace**: `reason`, `recommendAnalyze`, `listRecommendationApplications`, `getCacheStatistics`, `cleanupCache`, `invalidateCache`, `getHooksStatus`, `enableHook`, `disableHook`, `createPreference`, `getPreferences`, `updatePreference`, `deletePreference`, `getRecommendationStatistics`
- **SkanyrNamespace**: `getDiscovery`, `getDiscoveryEvents`, `analyzeBundle`, `discoverPageLive`, `detectedApis`, `hierarchy`, `expandNode`, `readerView`, `retry`, `health`, `listSessions`, `saveSession`, `getSession`, `deleteSession`, `endSession`, `updateSessionJob`
- **WebgrphNamespace**: `getCrawlStatus`, `getCrawlEvents`, `getCrawlPages`, `getDashboardSummary`, `getErrorSummary`, `getJobTrends`, `getDiscoveryPatterns`, `getEfficiencyMetrics`, `getSiteMappingTrends`, `getUserBehaviorInsights`

### Changed
- `checkDuplicates` endpoint corrected to `fetchyr/deduplication/check`

## [0.1.0] — 2026-04-09

### Added
- Initial release with core module support
- **Transport layer** — native `fetch` with retry, SSE streaming, exponential backoff
- **EvadrNamespace** — `fetch`, `fetchAsync`, `fetchStream`, `analyze`, `storeProxy`
- **WebgrphNamespace** — `crawl`, `crawlAll`, `crawlStream`, `getHierarchy`, `getJob`
- **SkanyrNamespace** — `discover`, `discoverAll`, `discoverStream`, `getApiMap`, `getJob`
- **NexusNamespace** — `analyze`, `synthesize`, `verify`, `execute`, `knowledge`
- **ParlyrNamespace** — `parse`, `chat`, `chatStream`, `deleteSession`
- **FetchyrNamespace** — `login`, `fetch`, `getSession`, `invalidateSession`, `createWorkflow`, `executeWorkflow`, `getExecution`, `detectForms`, `detectMfa`, `submitMfa`, `checkDuplicates`
- **KolektrNamespace** — `page`, `pageAll`, `extractHtml`
