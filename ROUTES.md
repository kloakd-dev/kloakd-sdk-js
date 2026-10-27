# Routes the SDK calls (0.3.0)

Checked against the API's route list (`tests/fixtures/routes.tsv`, generated
from kobe-scraper 4fb33ea4 with the module routers mounted as
`kernel/bootstrap.py` does). `tests/contract.test.ts` calls every public
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
| GET | evadr/vendors, profiles, proxies | live | unchanged |
| POST/DELETE | evadr/proxies[/{name}] | live | unchanged |
| POST | fetchyr/login | wrong path and fields | `authenticate(credentialName, targetUrl)` → POST fetchyr/authenticate |
| POST | fetchyr/fetch | removed | use `evadr.fetch(url, {sessionArtifactId})` |
| GET | fetchyr/sessions/{id} | removed | `getSession` dropped (list and delete remain) |
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
| GET/POST | kolektr/api-data/..., content, jobs, extraction-jobs, pipeline, progress, scrapers | live | unchanged (`kolektr/jobs` POST is a server stub: GAP-API-2) |
| POST | nexus/analyze | wrong fields (`html` optional) | `analyze(url, html, opts)` |
| POST | nexus/synthesize | wrong fields (`perception_id`) | `synthesize(url, html, goal)` |
| POST | nexus/verify, execute, knowledge | live, response read wrongly | response fields fixed |
| POST | nexus/reason | wrong fields (free body) | `reason(queryType, parameters)` |
| * | nexus/recommendations/... | live | unchanged (server-side many are broken: GAP-SEC-6) |
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
| GET | webgrph/analytics/... | live | unchanged |

Counts: 127 call sites in 0.2.0; 78 already right; 22 fixed (path, method,
request or response fields); 27 removed or moved (19 with no route, 8 moved
from skanyr to webgrph).

## Added in 0.3.0 (live routes the SDK did not cover)

`evadr.profile`, `evadr.waitForJob`, `fetchyr.resumeExecution`, the
`fetchyr` auth-chain calls, `webgrph.cancelCrawl`, `webgrph.crawlEvents`,
`webgrph.crawlAllPages`, and the `skanyr` site store: sites, sync, export,
APIs, resources, search, findings, technologies, snapshots, timeline, diff,
graph, extraction text and structure.

Not covered: `GET skanyr/resources/{id}/download` (binary body) and
`GET parlyr/chat/{id}/events`.
