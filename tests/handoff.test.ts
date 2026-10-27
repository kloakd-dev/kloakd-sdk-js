/**
 * The synchronous fetch answers within ~85 s; past that the API returns 202
 * and the fetch continues as a job (Cloudflare closes requests at 100 s).
 */
import { followJob } from '../src/_handoff.js';
import { JobFailedError, JobTimeoutError } from '../src/errors.js';
import { callUrl, makeClient, mockFetchSequence, parseCallBody } from './helpers.js';

type Calls = { mock: { calls: unknown[][] } };
const PAGE = { success: true, url: 'https://www.economist.com/', status_code: 200, tier_used: 3, html: '<html></html>', error: null };
const HANDED_OFF = { job_id: 'job-1', status: 'running', reason: 'sync_limit_reached', waited_seconds: 85, poll_url: '/api/v1/organizations/o/evadr/jobs/job-1', message: '' };

describe('evadr.fetch past the synchronous limit', () => {
  it('returns the page when the API answers in time', async () => {
    const fetch = mockFetchSequence([{ body: PAGE }]);
    const r = await makeClient(fetch).evadr.fetch(PAGE.url);
    expect(r.html).toBe('<html></html>');
    expect((fetch as unknown as Calls).mock.calls).toHaveLength(1);
  });

  it('follows a 202 to the job result', async () => {
    const fetch = mockFetchSequence([
      { body: HANDED_OFF, status: 202 },
      { body: { job_id: 'job-1', status: 'running' } },
      { body: { job_id: 'job-1', status: 'completed', result: PAGE } },
    ]);
    const r = await makeClient(fetch).evadr.fetch(PAGE.url, { pollIntervalMs: 1 });
    expect([r.ok, r.tierUsed, r.html]).toEqual([true, 3, '<html></html>']);
    const calls = (fetch as unknown as Calls).mock.calls;
    expect(callUrl(calls[1]!)).toContain('/evadr/jobs/job-1');
  });

  it('a failed job throws JobFailedError with the job id', async () => {
    const fetch = mockFetchSequence([
      { body: HANDED_OFF, status: 202 },
      { body: { job_id: 'job-1', status: 'failed', error: 'all attempts blocked' } },
    ]);
    const err = await makeClient(fetch).evadr.fetch(PAGE.url, { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobFailedError);
    expect([err.jobId, err.message]).toEqual(['job-1', 'all attempts blocked']);
  });

  it('stops following after the timeout', async () => {
    const running = { body: { job_id: 'job-1', status: 'running' } };
    const fetch = mockFetchSequence([{ body: HANDED_OFF, status: 202 }, running, running, running, running]);
    await expect(makeClient(fetch).evadr.fetch(PAGE.url, { pollIntervalMs: 5, pollTimeoutMs: 8 })).rejects.toBeInstanceOf(JobTimeoutError);
  });

  it('fetchAsync uses the async route without stray fields', async () => {
    const fetch = mockFetchSequence([{ body: { job_id: 'job-2', status: 'pending', message: '' }, status: 202 }]);
    const id = await makeClient(fetch).evadr.fetchAsync(PAGE.url, { webhookUrl: 'https://hooks.example/x' });
    const call = (fetch as unknown as Calls).mock.calls[0]!;
    expect(id).toBe('job-2');
    expect(callUrl(call)).toContain('/evadr/fetch/async');
    expect(parseCallBody(call)).toEqual({ url: PAGE.url, webhook_url: 'https://hooks.example/x' });
  });
});

const ORG = '00000000-0000-0000-0000-000000000001';
const HANDOFF_202 = { job_id: 'h-1', status: 'running', reason: 'sync_limit_reached', waited_seconds: 85, poll_url: `/api/v1/organizations/${ORG}/handoff/h-1`, message: '' };

describe('the other synchronous routes past the limit (handoff/{job_id})', () => {
  it('kolektr.page returns the same typed result as a direct 200', async () => {
    const extracted = { success: true, url: 'https://e.com', method: 'css', records: [{ a: 1 }], total_records: 1, job_id: 'x-9', artifact: { artifact_id: 'art-1' } };
    const fetch = mockFetchSequence([
      { body: HANDOFF_202, status: 202 },
      { body: { job_id: 'h-1', kind: 'kolektr.extract', status: 'running' } },
      { body: { job_id: 'h-1', kind: 'kolektr.extract', status: 'completed', result: extracted } },
    ]);
    const r = await makeClient(fetch).kolektr.page('https://e.com', { pollIntervalMs: 1 });
    expect([r.ok, r.records, r.totalRecords, r.artifactId, r.jobId]).toEqual([true, [{ a: 1 }], 1, 'art-1', 'x-9']);
    const calls = (fetch as unknown as Calls).mock.calls;
    expect(callUrl(calls[1]!)).toBe(`https://api.kloakd.dev/api/v1/organizations/${ORG}/handoff/h-1`);
    expect((calls[1]![1] as { headers: Record<string, string> }).headers['Authorization']).toBe('Bearer sk-test-fixture-key');
  });

  it('a 200 that carries a job_id is the result, not a hand-off', async () => {
    const fetch = mockFetchSequence([{ body: { success: true, url: 'u', job_id: 'x-1', poll_url: 'n/a', records: [] } }]);
    const r = await makeClient(fetch).kolektr.page('u');
    expect(r.jobId).toBe('x-1');
    expect((fetch as unknown as Calls).mock.calls).toHaveLength(1);
  });

  it('nexus.execute reads execution_result_id after a hand-off', async () => {
    const fetch = mockFetchSequence([
      { body: HANDOFF_202, status: 202 },
      { body: { status: 'completed', result: { url: 'u', strategy_id: 's1', records: [], success: true, execution_result_id: 'er-1' } } },
    ]);
    const r = await makeClient(fetch).nexus.execute('s1', 'u', { pollIntervalMs: 1 });
    expect([r.ok, r.executionResultId]).toEqual([true, 'er-1']);
  });

  it('fetchyr.authenticate: a failed job throws JobFailedError with its error', async () => {
    const fetch = mockFetchSequence([
      { body: HANDOFF_202, status: 202 },
      { body: { job_id: 'h-1', status: 'failed', error: 'login form not found' } },
    ]);
    const err = await makeClient(fetch).fetchyr.authenticate('cred', 'https://e.com', { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobFailedError);
    expect([err.jobId, err.message]).toEqual(['h-1', 'login form not found']);
  });

  it('an expired job (poll answers 404) throws JobFailedError', async () => {
    const fetch = mockFetchSequence([
      { body: HANDOFF_202, status: 202 },
      { body: { detail: 'Job h-1 not found or expired' }, status: 404 },
    ]);
    const err = await makeClient(fetch).nexus.synthesize('u', '<html/>', 'g', { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobFailedError);
    expect(err.jobId).toBe('h-1');
    expect(err.message).toContain('not found or expired');
  });

  it('nexus.analyze stops following after the timeout', async () => {
    const running = { body: { job_id: 'h-1', status: 'running' } };
    const fetch = mockFetchSequence([{ body: HANDOFF_202, status: 202 }, running, running, running, running]);
    const err = await makeClient(fetch).nexus.analyze('u', '<html/>', { pollIntervalMs: 5, pollTimeoutMs: 8 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobTimeoutError);
    expect(err.jobId).toBe('h-1');
  });
});

describe('followJob backoff', () => {
  it('waits 1.5 times longer each poll, up to 15 s', async () => {
    const waits: number[] = [];
    const realSetTimeout = global.setTimeout;
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
      waits.push(ms ?? 0);
      return realSetTimeout(fn, 0);
    }) as unknown as typeof setTimeout);
    try {
      let n = 0;
      const result = await followJob('j', async () => (++n < 8 ? { status: 'running' } : { status: 'completed', result: { v: 1 } }), { pollIntervalMs: 4000 });
      expect(result).toEqual({ v: 1 });
    } finally {
      spy.mockRestore();
    }
    expect(waits).toEqual([4000, 6000, 9000, 13500, 15000, 15000, 15000]);
  });
});
