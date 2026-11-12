# Routes the SDK calls (unreleased; after 0.6.0)

Checked against the API's route list (`tests/fixtures/routes.tsv`, generated
from kobe-scraper integration/2026-11-12b at 228857dc with the module routers
mounted as `kernel/bootstrap.py` does; 280 rows). `tests/contract.test.ts` calls every public
method and fails on any request that is not a live route.

All paths are under `/api/v1/organizations/{organization_id}/`.

## What 0.2.0 called

| Method | Path (0.2.0) | Status | 0.3.0 |
|---|---|---|---|
| POST | evadr/fetch | live | `fetch` follows a 202 job hand-off |
| POST | evadr/fetch (`async: true`) | wrong path | `fetchAsync` → POST evadr/fetch/async |
| POST | evadr/fetch/stream | removed | `fetchStream` = fetch/async + GET evadr/jobs/{id}/events |
| POST | evadr/analyze | live | unchanged |
| POST | evadr/scan | wrong fields | body is `{url}` only |
| GET | evadr/jobs/{id} | live | unchanged |
| GET | evadr/jobs/{id}/events | live, read as JSON | `jobEvents` streams it (SSE) |
| GET | evadr/vendors, profiles, proxies | live | unchanged (`profiles` removed in 0.4.0) |
| POST/DELETE | evadr/proxies[/{name}] | live | unchanged |
| POST | fetchyr/login | wrong path and fields | `authenticate(credentialName, targetUrl)` → POST fetchyr/authenticate |
| POST | fetchyr/fetch | removed | use `evadr.fetch(url, {sessionArtifactId})` |
| GET | fetchyr/sessions/{id} | removed then | `getSession` dropped in 0.3.0; the route is live again and `fetchyr.getSession` is back (see "Changed for 0.7.0") |
| DELETE | fetchyr/sessions/{id} | live | unchanged |
| POST | fetchyr/workflows | wrong fields (`url`) | `{name, steps, description?, workflow_type?}`; reads `id` |
| POST | fetchyr/workflows/{id}/execute | wrong fields (empty body) | `{target_url, session_artifact_id?, input_data?}` |
| GET | fetchyr/workflows/{id}/executions/{id} | live | reads `result` |
| POST | fetchyr/detect-forms | wrong path | POST fetchyr/form/detect |
| POST | fetchyr/detect-mfa | wrong path | POST fetchyr/mfa/detect |
| POST | fetchyr/submit-mfa | wrong path and fields | POST fetchyr/mfa-queue/{id}/resolve `{resolution}` |
| POST/GET/DELETE | fetchyr/account/credentials | live (fields loose) | `{name, username, password, extra?}` |
| GET | fetchyr/sessions, mfa-queue, mfa/challenges/{id}, mfa/statistics/{domain} | live | unchanged |
| POST | fetchyr/form/fill | wrong field (`submit`) | `{url, form_data, session_artifact_id?}` |
| GET/PATCH/DELETE | fetchyr/workflows[/{id}][/statistics] | live | PATCH sends the API's fields |
| POST | fetchyr/multi-site-workflows | wrong fields (`name` optional) | `name` required |
| POST | fetchyr/deduplication/check | wrong fields (`records`) | `checkDuplicate(url, {contentHash?, sessionId?})` |
| POST | fetchyr/deduplication/sessions | wrong fields | `{name, strategy?}` |
| GET | fetchyr/deduplication/... | live | unchanged |
| POST | kolektr/extract, extract/html | wrong fields (`schema`, `limit`, `offset`) | `schema_spec`; no paging fields |
| GET/POST | kolektr/api-data/..., content, jobs, extraction-jobs, pipeline, progress, scrapers | live | unchanged (removed in 0.4.0: `kolektr/jobs` POST, a server stub, GAP-API-2; the job progress, progress phases and pipeline calls) |
| POST | nexus/analyze | wrong fields (`html` optional) | `analyze(url, html, opts)` |
| POST | nexus/synthesize | wrong fields (`perception_id`) | `synthesize(url, html, goal)` |
| POST | nexus/verify, execute, knowledge | live, response read wrongly | response fields fixed |
| POST | nexus/reason | wrong fields (free body) | `reason(queryType, parameters)` (0.5.0: `parameters` is a list of strings) |
| * | nexus/recommendations/... | live | unchanged (server-side many are broken: GAP-SEC-6; removed in 0.4.0) |
| POST/DELETE | parlyr/parse, chat, chat/{id} | live | unchanged |
| POST | skanyr/discover, discover/stream | removed | discovery is `webgrph.crawl` |
| GET | skanyr/discover/{id}[/events] | removed | — |
| POST | skanyr/analyze-bundle, discover-page/live, hierarchy, expand-node, retry | removed | — |
| GET | skanyr/health, api-map/{id}, jobs/{id} | removed | — |
| GET | skanyr/detected-apis | moved | `webgrph.detectedApis` |
| POST | skanyr/reader-view | moved | `webgrph.readerView` |
| * | skanyr/sessions[...] | moved | `webgrph.listSessions/saveSession/getSession/deleteSession/endSession/updateSessionJob` |
| POST | webgrph/crawl | live, read as finished | `crawl` waits for the crawl and pages its nodes |
| POST | webgrph/crawl/stream | removed | `crawlStream` = crawl + GET webgrph/crawl/{id}/events |
| GET | webgrph/crawl/{id}, events, pages | live | events streamed; pages by cursor |
| GET | webgrph/hierarchy/{id}, jobs/{id} | removed | use `getCrawlPages` / `getCrawlStatus` |
| GET | webgrph/analytics/... | live | unchanged (removed in 0.4.0) |

Counts: 127 call sites in 0.2.0; 78 already right; 22 fixed (path, method,
request or response fields); 27 removed or moved (19 with no route, 8 moved
from skanyr to webgrph).

## Added in 0.3.0 (live routes the SDK did not cover)

`evadr.profile`, `evadr.waitForJob`, `fetchyr.resumeExecution`, the
`fetchyr` auth-chain calls, `webgrph.cancelCrawl`, `webgrph.crawlEvents`,
`webgrph.crawlAllPages`, and the `skanyr` site store: sites, sync, export,
APIs, resources, search, findings, technologies, snapshots, timeline, diff,
graph, extraction text and structure.

Not covered then: `GET skanyr/resources/{id}/download` (binary body) and
`GET parlyr/chat/{id}/events`. The full list of what the SDK does not cover
now is whatever `tests/fixtures/routes.tsv` holds that
`tests/contract.test.ts` does not call.

## Changed in 0.4.0

The API removed the module routes that answered invented results
(kobe-scraper d7d25134). The route list (`tests/fixtures/routes.tsv`) drops
them: the 13 `nexus/recommendations/...` routes, the standalone
`recommendations/...` router (no longer mounted), `POST kolektr/jobs`, the
kolektr job progress, progress phases and pipeline routes,
`webgrph/analytics/job-trends` and `error-summary`, and `evadr/profiles`. It
adds the hand-off poll `GET handoff/{job_id}`.

The other five `webgrph/analytics/...` routes still exist but serve only the
dashboard (`modules/webgrph/analytics_router.py`; the public API spec
excludes them), so the SDK no longer calls them; their rows stay in the
route list.

| Method | Path | 0.4.0 |
|---|---|---|
| * | nexus/recommendations/... (13 routes) | removed with their methods (`recommendAnalyze`, `listRecommendationApplications`, cache, hooks, preferences, statistics) |
| POST | kolektr/jobs | `createJob` removed |
| GET | kolektr/jobs/{id}/progress, progress/summary, progress/events, progress/latest | `getJobProgress`, `getJobProgressSummary`, `getJobProgressEvents`, `getJobProgressLatest` removed |
| GET | kolektr/progress/phases, phases/{name}, phases/{name}/steps, progress/summary | `listProgressPhases`, `getProgressPhase`, `getProgressPhaseSteps`, `getProgressSummary` removed |
| GET | kolektr/pipeline/{id}/stream, pipeline/{id}/events | `getPipelineStream`, `getPipelineEvents` removed |
| GET | webgrph/analytics/job-trends, error-summary | `getJobTrends`, `getErrorSummary` removed |
| GET | webgrph/analytics/dashboard/summary, content/discovery-patterns, scraping/efficiency-metrics, site-maps/trends, users/behavior-insights | dashboard-only: `getDashboardSummary`, `getDiscoveryPatterns`, `getEfficiencyMetrics`, `getSiteMappingTrends`, `getUserBehaviorInsights` removed |
| GET | evadr/profiles | `listProfiles` removed |
| POST | kolektr/extract, fetchyr/authenticate, fetchyr/form/detect, fetchyr/form/fill, fetchyr/mfa/detect, nexus/analyze, nexus/synthesize, nexus/execute | a 202 hand-off is followed: GET handoff/{job_id} (the 202's `poll_url`) until completed or failed |
| POST | evadr/fetch | a 202 is followed through its `poll_url`, GET evadr/jobs/{job_id} |
| POST | nexus/execute | reads `execution_result_id` (for `knowledge`) |

`tests/contract.test.ts` checks that each of the nine methods follows a 202
through a live poll route.

## Changed for 0.7.0 (unreleased), second part

Checked against kobe-scraper main 6bd19e9b. The route list fixture is now
generated again, not edited: every route of the API app (292 rows then), with
`{x:path}` parameters written `{x}`. The five `webgrph/analytics/...`
dashboard routes that 0.4.0 left in the list are gone from the API.

| Method | Path | 0.7.0 |
|---|---|---|
| GET | skanyr/extractions/{content_hash}/text | the answer is `text/plain`; `skanyr.getExtractionText` returns the string (it returned `{}` before) |
| GET | webgrph/crawl/{id} | also reads `message`, `error_code`, `is_partial`, `partial_reason`, `resumable`, `pages_discovered`, `pages_fetched`, `pages_unfetched`. Status `held_quota` ends the wait: `crawl`, `waitForCrawl` and `crawlAll` return, they do not throw and do not poll to the timeout |
| POST | webgrph/crawl/{id}/continue | new `webgrph.continueCrawl`; answers 202 `{success, crawl_id, status}`; 409 for a crawl that is not resumable, has not ended, is already continuing, or is not yours |
| GET | webgrph/crawl/{id}/pages | reads `metadata.fetch_status` and `metadata.fetch_error`; `statusCode` and `crawlParentUrl` are removed from `PageNode` (the API never sent them) |
| GET | webgrph/crawl-extract/{job_id} | reads the `crawl` object (`status`, `is_partial`, `partial_reason`, `pages_discovered`, `pages_fetched`, `pages_unfetched`, `cancelled`, `root_unfetched`, `error`, `error_code`); `waitForCrawlExtract` returns when the job's crawl is `held_quota` |
| GET | webgrph/crawl-extract/{job_id}/export | reads the `X-Crawl-*` headers into `crawl` |
| GET | batch-jobs/{batch_job_id}/export | sends neither `X-Job-Status` nor `X-Crawl-*`: `jobStatus` and `crawl` are null |
| POST | fetchyr/login-sessions | new `fetchyr.startLoginSession`; body `{target_url, method?, cookies?, user_agent?, country?}`; 202 for `interactive`, 201 for `cookies` |
| GET | fetchyr/sessions/{artifact_id} | new `fetchyr.getSession` |
| POST | fetchyr/sessions/{artifact_id}/resume | new `fetchyr.resumeSession`; 409 when the session is not paused or the site signed it out |
| POST | kolektr/extract, extract/html | reads `level`, `level_reason`, `login_options`; `hasMore` and `total` are removed (never sent) |
| POST | nexus/analyze, synthesize, verify | the answers have no `error` field; it is removed from the three result types |
| POST | nexus/reason | `timeout_secs` is sent when `timeoutSecs` is given, 0 included |

Not covered, by choice: the jobs, results and webhook routes, and the
dashboard routes (billing, organisations, API keys). The batch routes and
the unified scrape are covered in the third part, below.

## Changed for 0.7.0 (unreleased), third part

Checked against kobe-scraper integration/2026-11-12b (228857dc):
`kernel/jobs_runs_router.py`, `application/jobs/batch_control.py` and
`api/v1/endpoints/unified_scraping.py`. The route list fixture is generated
from that checkout: 280 rows. The 12 `performance/...` routes are gone from
the API; the SDK called none of them.

| Method | Path | 0.7.0 |
|---|---|---|
| POST | batch-jobs | new `client.createBatchJob`; body `{urls, extraction_config?, crawl_id?, entity_type?, fields?}`; 201; 403 `test_key_not_allowed`, 409 `concurrent_limit`, 413 `batch_too_large`, 422 for no URLs, 503 `dispatch_failed` |
| GET | batch-jobs | new `client.listBatchJobs`; `page`, `page_size` (1–100) |
| GET | batch-jobs/{batch_job_id} | new `client.getBatchJob` |
| GET | batch-jobs/{batch_job_id}/results | new `client.getBatchJobResults`; `limit` (1–1000), `offset`; each item is `{job_id, url, status, extracted_data, api_data}` |
| POST | batch-jobs/{batch_job_id}/pause | new `client.pauseBatchJob`; only a running batch; a paused one answers 200 unchanged; otherwise 409 `invalid_batch_transition` |
| POST | batch-jobs/{batch_job_id}/resume | new `client.resumeBatchJob`; only a paused batch; a running one answers 200 unchanged; otherwise 409 `invalid_batch_transition`; 409 `concurrent_limit`; 503 `dispatch_failed` (paused again) |
| POST | batch-jobs/{batch_job_id}/cancel | new `client.cancelBatchJob`; a cancelled one answers 200 unchanged; 409 `invalid_batch_transition` once completed or failed |
| POST | scraping/unified | new `client.unifiedScrape`; body `{url, prompt?, mode?, schema?, options?, context?, constraints?, session_artifact_id?}`; a 202 hand-off is followed through GET handoff/{job_id}; 403 `test_key_not_allowed`, `module_not_entitled` |
| GET | scraping/unified/{job_id} | new `client.getUnifiedScrape` |

Not covered, by choice: `DELETE batch/{batch_job_id}`, `POST
batch/url-import` and the event stream `GET batch-jobs/{batch_job_id}/stream`.

## Changed for 0.7.0 (unreleased), first part

Checked against kobe-scraper e5e358aa. The route list fixture was edited by
hand for these routes at the time: POST nexus/execute removed, the six
crawl-extract routes and the batch export added.

| Method | Path | After 0.6.0 |
|---|---|---|
| POST | nexus/execute | the API removed the route; `nexus.execute` and `NexusExecuteResult` are removed |
| POST | nexus/knowledge | the body is now `{strategy_id, url, outcome}` and the route is not in the public API reference; `nexus.knowledge` and `NexusKnowledgeResult` are removed |
| POST | nexus/verify | also reads `status`, `risk_score`, `safety_checks`, `verification_result_id`, `duration_ms` |
| POST | webgrph/crawl-extract | `startCrawlExtract` / `crawlExtract`; body `{url, max_depth?, max_pages?, include_external_links?, session_artifact_id?, capture_mode?, scope?, budget?, extract?: {entity_type?, fields?, schema?}}`; answers 202 |
| GET | webgrph/crawl-extract/{job_id} | `getCrawlExtract`, `waitForCrawlExtract` |
| GET | webgrph/crawl-extract/{job_id}/results | `getCrawlExtractResults`, `iterCrawlExtractResults`, `crawlExtractAllResults`; `limit` (1–1000), `cursor`, `shape`, `page_type`, `kind`; follows `next_cursor` |
| GET | webgrph/crawl-extract/{job_id}/pages | `getCrawlExtractPages`; `limit` (1–1000), `offset`, `status` |
| GET | webgrph/crawl-extract/{job_id}/export | `exportCrawlExtract` (stream), `downloadCrawlExtract` (file); `format=json\|ndjson\|csv`, `shape`, `page_type`, `kind`; reads `X-Job-Status`, the `X-Crawl-*` headers and the `Content-Disposition` file name |
| POST | webgrph/crawl-extract/{job_id}/cancel | `cancelCrawlExtract`; 409 once the job has ended |
| GET | batch-jobs/{batch_job_id}/export | `client.exportBatchJob`, `client.downloadBatchJob`; `format=json\|ndjson\|csv` |

The 202 hand-off is now followed by eight methods (`nexus.execute` is gone).
The API also hands off POST scraping/unified; `client.unifiedScrape` follows it
(third part of the 0.7.0 changes, above).

## Changed in 0.6.0

No route is added or removed (kobe-scraper 0bb0c6b5, deployed 2 November 2026).

| Method | Path | 0.6.0 |
|---|---|---|
| POST | kolektr/extract, extract/html | `schema_spec.item_selector` from `itemSelector` (option or `SchemaSpec`); shorthand fields may carry `attribute` and `type` (GAP-API-11) |
| GET | webgrph/crawl/{id}/pages | `include_grouping=true` from `includeGrouping`; `limit` checked to be 1–1000 before sending; reads `metadata.is_grouping`, `parent_url` (GAP-API-9/10) |
| * | every metered route | 409 `concurrent_limit` reads `active_requests` (GAP-BILL-13); not retried |

## Changed in 0.5.0

No route is added or removed; the requests and the reading of the answers
change (kobe-scraper e5f15f7d).

| Method | Path | 0.5.0 |
|---|---|---|
| GET | handoff/{job_id} | public: `client.getHandoff(jobId)`, `client.waitForHandoff(jobId, opts)` |
| POST | parlyr/chat | events read as `{type, content, data, actions, timestamp}` (thinking, interpretation, progress, results, error, warning, auth_required, mfa_required, clarification, export_ready, text; then `end`) |
| POST | kolektr/extract, extract/html | `schema_spec.fields[].selector` without the `css:` prefix; a fields list is accepted; reads `auth_required`, `discovery_id` |
| POST | evadr/fetch | reads `auth_required`, `discovery_id` |
| GET | evadr/jobs/{id}/events, webgrph/crawl/{id}/events | read as pipeline events (`event_type, stage_id, status, message, progress_pct, metadata, error, sequence`); fetch jobs also `{type, tier_used, artifact_id, error}` |
| POST | nexus/reason | `parameters` is a list of strings |
| PATCH | skanyr/sites/{id} | `updateSite(siteId, policy)`: `{policy: string}` |
| POST | skanyr/sites/{id}/export | returns the ZIP bytes |
| GET | skanyr/sites, resources, sites/{id}/resources, apis, findings, technologies | typed as arrays |
| POST | fetchyr/multi-site-workflows | `dependencies` is a list of `{dependent_site, dependency_site, dependency_type?, condition?, data_requirements?, timeout?}` |
| POST | webgrph/crawl | `max_depth` / `max_pages` sent only when set (the API applies the tier default) |
| GET | webgrph/sessions | `active_only` always sent (default true) |
| GET | kolektr/jobs | `page`, `limit`, `status_filter` |
| GET | kolektr/scrapers | `page`, `page_size`, `is_template` |
| GET | kolektr/content | `page`, `page_size`, `search` |
| GET | fetchyr/workflows | `page`, `page_size` |
| GET/POST | kolektr/api-data/{api_endpoint} | `endpoint_hash`; extract-all also `max_records`; the endpoint is URL-encoded |
| * | every route with a path parameter | the parameter is URL-encoded |
