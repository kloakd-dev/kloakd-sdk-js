/**
 * Batch jobs and the unified scrape (0.7.0), each checked
 * against kobe-scraper integration/2026-11-12b (228857dc):
 * kernel/jobs_runs_router.py (create_batch_job, get_batch_job,
 * list_batch_jobs, get_batch_job_results, pause_batch_job,
 * resume_batch_job, cancel_batch_job), application/jobs/batch_control.py
 * and api/v1/endpoints/unified_scraping.py (UnifiedScrapeRequest,
 * UnifiedScrapeResponse, JobStatusResponse). Every answer here is a mock's.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ApiError, ConcurrencyLimitError, ForbiddenError, JobFailedError } from '../src/errors.js';
import { makeClient, mockFetch, mockFetchSequence, ORG_PREFIX } from './helpers.js';

type Call = [string, RequestInit];
const calls = (f: jest.Mock) => f.mock.calls as unknown as Call[];
const urlOf = (f: jest.Mock, i = 0): URL => new URL(calls(f)[i]![0]);
const pathOf = (f: jest.Mock, i = 0): string => urlOf(f, i).pathname.slice(ORG_PREFIX.length + 1);
const methodOf = (f: jest.Mock, i = 0): string => String(calls(f)[i]![1].method);
const bodyOf = (f: jest.Mock, i = 0): Record<string, unknown> =>
  JSON.parse(String(calls(f)[i]![1].body ?? '{}')) as Record<string, unknown>;

const PAUSED_MESSAGE = 'paused: items that were already running finish; the rest wait until the batch is resumed.';
/** BatchJob (kernel/jobs_runs_router.py:276-287). */
const batch = (status: string, message: string | null = null) => ({
  id: 'b-1', name: 'Batch Extraction (3 URLs)', status, total_items: 3, completed_items: 1,
  created_at: '2026-11-12T10:00:00', message,
});
const parsed = (status: string, message: string | null = null) => ({
  id: 'b-1', name: 'Batch Extraction (3 URLs)', status, totalItems: 3, completedItems: 1,
  createdAt: '2026-11-12T10:00:00', message,
});
/** The 409 of a refused control (jobs_runs_router.py:1179-1189). */
const refused = (action: string, status: string, message: string) => ({
  detail: { error: 'invalid_batch_transition', message, action, status },
});

describe('batch jobs: create, read, list, results', () => {
  it('createBatchJob posts the URLs and only the options given, and reads the 201', async () => {
    const f = mockFetch(batch('pending'), 201);
    const out = await makeClient(f).createBatchJob(['https://a/1', 'https://a/2', 'https://a/3']);
    expect([methodOf(f), pathOf(f)]).toEqual(['POST', 'batch-jobs']);
    expect(bodyOf(f)).toEqual({ urls: ['https://a/1', 'https://a/2', 'https://a/3'] });
    expect(out).toEqual(parsed('pending'));
  });

  it('createBatchJob sends extraction_config, crawl_id, entity_type and fields under the API names', async () => {
    const f = mockFetch(batch('pending'), 201);
    await makeClient(f).createBatchJob(['https://a/1'], {
      extractionConfig: { selectors: { title: 'h1' } }, crawlId: 'c-1', entityType: 'products', fields: ['name', 'price'],
    });
    expect(bodyOf(f)).toEqual({
      urls: ['https://a/1'], extraction_config: { selectors: { title: 'h1' } }, crawl_id: 'c-1',
      entity_type: 'products', fields: ['name', 'price'],
    });
  });

  it('a batch over the running-batches limit is ConcurrencyLimitError and is not retried', async () => {
    const f = mockFetch({ detail: { error: 'concurrent_limit', message: 'Concurrent batch limit reached (2 for free tier).', tier: 'free', concurrent_limit: 2, active_batches: 2 } }, 409);
    const err = await makeClient(f).createBatchJob(['https://a/1']).catch((e) => e);
    expect(err).toBeInstanceOf(ConcurrencyLimitError);
    expect([err.tier, err.concurrentLimit]).toEqual(['free', 2]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a batch that could not be queued is the API 503 dispatch_failed, an ApiError, and is not retried', async () => {
    const f = mockFetch({ detail: { error: 'dispatch_failed', message: 'The batch could not be queued and was not started. Try again.', batch_job_id: 'b-1' } }, 503);
    const err = await makeClient(f).createBatchJob(['https://a/1']).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([err.statusCode, err.code]).toEqual([503, 'dispatch_failed']);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a test key and too many URLs keep the API codes', async () => {
    const forbidden = await makeClient(mockFetch({ detail: { error: 'test_key_not_allowed', message: 'Batch jobs are not available with a test key. Use a live API key.' } }, 403))
      .createBatchJob(['https://a/1']).catch((e) => e);
    expect(forbidden).toBeInstanceOf(ForbiddenError);
    expect(forbidden.code).toBe('test_key_not_allowed');
    const tooLarge = await makeClient(mockFetch({ detail: { error: 'batch_too_large', message: 'A batch on the free tier holds at most 10 URLs.', tier: 'free', max_items: 10, requested_items: 11 } }, 413))
      .createBatchJob(['https://a/1']).catch((e) => e);
    expect([tooLarge.statusCode, tooLarge.code]).toEqual([413, 'batch_too_large']);
  });

  it('getBatchJob reads the batch; a paused batch carries the API message', async () => {
    const f = mockFetch(batch('paused', PAUSED_MESSAGE));
    const out = await makeClient(f).getBatchJob('b 1');
    expect([methodOf(f), pathOf(f)]).toEqual(['GET', 'batch-jobs/b%201']);
    expect(out).toEqual(parsed('paused', PAUSED_MESSAGE));
  });

  it('getBatchJob of a batch that is not yours is the API 404', async () => {
    const err = await makeClient(mockFetch({ detail: 'Batch job b-9 not found' }, 404)).getBatchJob('b-9').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(404);
  });

  it('listBatchJobs sends page and page_size only when given', async () => {
    const f = mockFetch({ total: 12, batch_jobs: [batch('running'), batch('completed')] });
    const out = await makeClient(f).listBatchJobs({ page: 2, pageSize: 5 });
    expect([methodOf(f), pathOf(f), urlOf(f).search]).toEqual(['GET', 'batch-jobs', '?page=2&page_size=5']);
    expect(out.total).toBe(12);
    expect(out.batchJobs.map((b) => b.status)).toEqual(['running', 'completed']);
    const bare = mockFetch({ total: 0, batch_jobs: [] });
    expect(await makeClient(bare).listBatchJobs()).toEqual({ total: 0, batchJobs: [] });
    expect(urlOf(bare).search).toBe('');
  });

  it('getBatchJobResults reads the items and the counts, and pages with limit and offset', async () => {
    const f = mockFetch({
      batch_job_id: 'b-1',
      results: [
        { job_id: 'j-1', url: 'https://a/1', status: 'completed', extracted_data: [{ title: 'One' }], api_data: null },
        { job_id: 'j-2', url: 'https://a/2', status: 'pending', extracted_data: null, api_data: null },
      ],
      total_jobs: 3, completed_jobs: 1, failed_jobs: 0,
    });
    const out = await makeClient(f).getBatchJobResults('b-1', { limit: 2, offset: 0 });
    expect([methodOf(f), pathOf(f), urlOf(f).search]).toEqual(['GET', 'batch-jobs/b-1/results', '?limit=2&offset=0']);
    expect(out).toEqual({
      batchJobId: 'b-1',
      results: [
        { jobId: 'j-1', url: 'https://a/1', status: 'completed', extractedData: [{ title: 'One' }], apiData: null },
        { jobId: 'j-2', url: 'https://a/2', status: 'pending', extractedData: null, apiData: null },
      ],
      totalJobs: 3, completedJobs: 1, failedJobs: 0,
    });
    const bare = mockFetch({ batch_job_id: 'b-1', results: [] });
    await makeClient(bare).getBatchJobResults('b-1');
    expect(urlOf(bare).search).toBe('');
  });
});

describe('batch controls: pause, resume, cancel', () => {
  const CONTROLS = [
    { name: 'pauseBatchJob', action: 'pause', after: 'paused', call: (c: ReturnType<typeof makeClient>) => c.pauseBatchJob('b 1') },
    { name: 'resumeBatchJob', action: 'resume', after: 'running', call: (c: ReturnType<typeof makeClient>) => c.resumeBatchJob('b 1') },
    { name: 'cancelBatchJob', action: 'cancel', after: 'cancelled', call: (c: ReturnType<typeof makeClient>) => c.cancelBatchJob('b 1') },
  ];

  it.each(CONTROLS)('$name posts to the $action route with no fields and reads the batch', async ({ action, after, call }) => {
    const f = mockFetch(batch(after, after === 'paused' ? PAUSED_MESSAGE : null));
    const out = await call(makeClient(f));
    expect([methodOf(f), pathOf(f), bodyOf(f)]).toEqual(['POST', `batch-jobs/b%201/${action}`, {}]);
    expect(out).toEqual(parsed(after, after === 'paused' ? PAUSED_MESSAGE : null));
  });

  it.each(CONTROLS)('$name called again is a 200 with the same state, not an error', async ({ after, call }) => {
    const f = mockFetchSequence([{ body: batch(after) }, { body: batch(after) }]);
    const client = makeClient(f);
    const first = await call(client);
    const second = await call(client);
    expect(second).toEqual(first);
    expect(second.status).toBe(after);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...CONTROLS[0]!, status: 'pending', message: 'Only a running batch can be paused (current status: pending).' },
    { ...CONTROLS[1]!, status: 'completed', message: 'Only a paused batch can be resumed (current status: completed).' },
    { ...CONTROLS[2]!, status: 'completed', message: 'A batch that has completed cannot be cancelled.' },
  ])('$name refused is the API 409 invalid_batch_transition, an ApiError, and is not retried', async ({ action, status, message, call }) => {
    const f = mockFetch(refused(action, status, message), 409);
    const err = await call(makeClient(f)).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.constructor.name).toBe('ApiError');
    expect([err.statusCode, err.code]).toEqual([409, 'invalid_batch_transition']);
    expect(err.message).toContain(message);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('resuming a batch held for quota is refused with the API reason', async () => {
    const message = 'This batch is held for quota, not paused: it resumes by itself when the organisation\'s allowance is raised.';
    const err = await makeClient(mockFetch(refused('resume', 'held_quota', message), 409)).resumeBatchJob('b-1').catch((e) => e);
    expect(err.code).toBe('invalid_batch_transition');
    expect(err.message).toContain('held for quota');
  });

  it('a resume that cannot queue the items is the API 503 dispatch_failed, an ApiError, and is not retried', async () => {
    const f = mockFetch({ detail: { error: 'dispatch_failed', message: 'The batch\'s items could not be queued; the batch is paused again. Try again.', batch_job_id: 'b-1', items_not_queued: 2 } }, 503);
    const err = await makeClient(f).resumeBatchJob('b-1').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([err.statusCode, err.code]).toEqual([503, 'dispatch_failed']);
    expect(err.message).toContain('paused again');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('a resume over the running-batches limit is ConcurrencyLimitError', async () => {
    const err = await makeClient(mockFetch({ detail: { error: 'concurrent_limit', message: 'Concurrent batch limit reached (2 for free tier).', tier: 'free', concurrent_limit: 2, active_batches: 2 } }, 409))
      .resumeBatchJob('b-1').catch((e) => e);
    expect(err).toBeInstanceOf(ConcurrencyLimitError);
  });

  it('a control on a batch that is not yours is the API 404', async () => {
    for (const { call } of CONTROLS) {
      const err = await call(makeClient(mockFetch({ detail: 'Batch job b 1 not found' }, 404))).catch((e) => e);
      expect([err.constructor.name, err.statusCode]).toEqual(['ApiError', 404]);
    }
  });
});

describe('unified scrape', () => {
  const JOB = '5f0c7a52-4f5e-4f43-9d55-0c1c6b6f0a11';
  /** UnifiedScrapeResponse (api/v1/endpoints/unified_scraping.py:150-160). */
  const ANSWER = {
    success: true, job_id: JOB, level: 'level2', status: 'completed',
    escalation_path: [{ from: 'level1', to: 'level2', reason: 'blocked', timestamp: '2026-11-12T10:00:05' }],
    message: 'Scraping initiated at level2', metadata: { complexity: 0.8 }, auth_required: false, discovery_id: null,
  };
  const PARSED = {
    success: true, jobId: JOB, level: 'level2', status: 'completed',
    escalationPath: [{ from: 'level1', to: 'level2', reason: 'blocked', timestamp: '2026-11-12T10:00:05' }],
    message: 'Scraping initiated at level2', metadata: { complexity: 0.8 }, authRequired: false, discoveryId: null,
  };

  it('unifiedScrape posts the URL alone when no option is given', async () => {
    const f = mockFetch(ANSWER);
    const out = await makeClient(f).unifiedScrape('https://shop.example/list');
    expect([methodOf(f), pathOf(f)]).toEqual(['POST', 'scraping/unified']);
    expect(bodyOf(f)).toEqual({ url: 'https://shop.example/list' });
    expect(out).toEqual(PARSED);
  });

  it('unifiedScrape sends the request fields of the route and nothing else', async () => {
    const f = mockFetch(ANSWER);
    await makeClient(f).unifiedScrape('https://shop.example/list', {
      prompt: 'product names and prices', mode: 'level2', schema: { name: 'product name', price: 'price' },
      options: { timeout: 60 }, context: { locale: 'en' }, constraints: { max_cost: 1 }, sessionArtifactId: 'art-1',
      pollIntervalMs: 1, pollTimeoutMs: 1000,
    });
    expect(bodyOf(f)).toEqual({
      url: 'https://shop.example/list', prompt: 'product names and prices', mode: 'level2',
      schema: { name: 'product name', price: 'price' }, options: { timeout: 60 }, context: { locale: 'en' },
      constraints: { max_cost: 1 }, session_artifact_id: 'art-1',
    });
  });

  it('a login page found first is an answer, not an error: authRequired and discoveryId', async () => {
    const f = mockFetch({ ...ANSWER, level: 'preflight', status: 'auth_required', escalation_path: [], message: 'Login page detected — auth-chain discovery started', metadata: null, auth_required: true, discovery_id: 'd-1' });
    const out = await makeClient(f).unifiedScrape('https://shop.example/account');
    expect([out.level, out.status, out.authRequired, out.discoveryId, out.metadata, out.escalationPath]).toEqual(['preflight', 'auth_required', true, 'd-1', null, []]);
  });

  it('a 202 hand-off is followed through its poll_url to the route\'s own answer', async () => {
    const f = mockFetchSequence([
      { status: 202, body: { job_id: 'h-1', status: 'running', reason: 'sync_limit_reached', waited_seconds: 85, poll_url: `${ORG_PREFIX}/handoff/h-1`, message: '' } },
      { body: { job_id: 'h-1', status: 'running' } },
      { body: { job_id: 'h-1', status: 'completed', result: ANSWER } },
    ]);
    const out = await makeClient(f).unifiedScrape('https://shop.example/list', { pollIntervalMs: 1 });
    expect([0, 1, 2].map((i) => `${methodOf(f, i)} ${pathOf(f, i)}`)).toEqual(['POST scraping/unified', 'GET handoff/h-1', 'GET handoff/h-1']);
    expect(out).toEqual(PARSED);
  });

  it('a handed-off scrape that fails is JobFailedError with the job id', async () => {
    const f = mockFetchSequence([
      { status: 202, body: { job_id: 'h-1', status: 'running', poll_url: `${ORG_PREFIX}/handoff/h-1` } },
      { body: { job_id: 'h-1', status: 'failed', error: 'The site could not be reached' } },
    ]);
    const err = await makeClient(f).unifiedScrape('https://shop.example/list', { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobFailedError);
    expect(err.jobId).toBe('h-1');
  });

  it.each([
    ['test_key_not_allowed', 'Unified scrapes are not available with a test key. Use a live API key.'],
    ['module_not_entitled', 'A unified scrape extracts data and may use the Strategy Engine: it needs the Kolektr and Nexus modules.'],
  ])('403 %s is ForbiddenError with the API code', async (code, message) => {
    const err = await makeClient(mockFetch({ detail: { error: code, message } }, 403)).unifiedScrape('https://shop.example/list').catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.code).toBe(code);
  });

  it('getUnifiedScrape reads a running job with its progress', async () => {
    /** JobStatusResponse (unified_scraping.py:172-184). */
    const f = mockFetch({
      id: JOB, status: 'running', level: 'level1', progress: 40,
      progress_detail: { percentage: 40, current_step: 'Extracting', items_found: 8, items_target: 20, partial_results: [{ name: 'A' }] },
      created_at: '2026-11-12T10:00:00', updated_at: '2026-11-12T10:00:30', completed_at: null, error: null, result: null, escalation_path: [],
    });
    const out = await makeClient(f).getUnifiedScrape(JOB);
    expect([methodOf(f), pathOf(f)]).toEqual(['GET', `scraping/unified/${JOB}`]);
    expect(out).toEqual({
      id: JOB, status: 'running', level: 'level1', progress: 40,
      progressDetail: { percentage: 40, currentStep: 'Extracting', itemsFound: 8, itemsTarget: 20, partialResults: [{ name: 'A' }] },
      createdAt: '2026-11-12T10:00:00', updatedAt: '2026-11-12T10:00:30', completedAt: null, error: null, result: null, escalationPath: [],
    });
  });

  it('getUnifiedScrape reads a completed job with its result and escalation', async () => {
    const f = mockFetch({
      id: JOB, status: 'completed', level: 'level2', progress: 100, progress_detail: null,
      created_at: '2026-11-12T10:00:00', updated_at: '2026-11-12T10:01:00', completed_at: '2026-11-12T10:01:00', error: null,
      result: { data: [{ name: 'A', price: '1' }] }, escalation_path: ANSWER.escalation_path,
    });
    const out = await makeClient(f).getUnifiedScrape(JOB);
    expect([out.status, out.progressDetail, out.completedAt, out.result]).toEqual(['completed', null, '2026-11-12T10:01:00', { data: [{ name: 'A', price: '1' }] }]);
    expect(out.escalationPath).toEqual(PARSED.escalationPath);
  });

  it('getUnifiedScrape of a job that is not yours is the API 404', async () => {
    const err = await makeClient(mockFetch({ detail: `Job ${JOB} not found` }, 404)).getUnifiedScrape(JOB).catch((e) => e);
    expect([err.constructor.name, err.statusCode]).toEqual(['ApiError', 404]);
  });
});

describe('the batch and unified scrape routes are in the API route list', () => {
  const live = new Set(readFileSync(join(__dirname, 'fixtures', 'routes.tsv'), 'utf8').trim().split('\n'));
  const P = '/api/v1/organizations/{organization_id}';

  it('every route the new methods call is listed', () => {
    const wanted = [
      `POST\t${P}/batch-jobs`,
      `GET\t${P}/batch-jobs`,
      `GET\t${P}/batch-jobs/{batch_job_id}`,
      `GET\t${P}/batch-jobs/{batch_job_id}/results`,
      `POST\t${P}/batch-jobs/{batch_job_id}/pause`,
      `POST\t${P}/batch-jobs/{batch_job_id}/resume`,
      `POST\t${P}/batch-jobs/{batch_job_id}/cancel`,
      `POST\t${P}/scraping/unified`,
      `GET\t${P}/scraping/unified/{job_id}`,
    ];
    expect(wanted.filter((w) => !live.has(w))).toEqual([]);
  });

  it('the list is the integration branch\'s: 280 routes, the performance routes gone', () => {
    expect(live.size).toBe(280);
    expect([...live].filter((r) => r.includes(`${P}/performance/`))).toEqual([]);
  });
});
