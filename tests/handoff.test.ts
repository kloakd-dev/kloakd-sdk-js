/**
 * The synchronous fetch answers within ~85 s; past that the API returns 202
 * and the fetch continues as a job (Cloudflare closes requests at 100 s).
 */
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
