# Changelog

All notable changes to the KLOAKD TypeScript/JavaScript SDK are documented here.

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
