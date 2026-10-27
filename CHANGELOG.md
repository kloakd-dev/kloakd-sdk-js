# Changelog

All notable changes to the KLOAKD TypeScript/JavaScript SDK are documented here.

## [0.3.0] — 2026-10-27

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

## [0.2.0] — 2026-05-13

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
