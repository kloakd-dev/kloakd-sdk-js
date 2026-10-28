/**
 * KLOAKD SDK — following a request the API handed off as a job (HTTP 202).
 *
 * The API sits behind Cloudflare, which closes requests at 100 s. A
 * synchronous route still running after about 85 s answers 202 with a
 * `job_id` and a `poll_url`, and the work continues as a job:
 *
 *   - `evadr/fetch` polls `…/evadr/jobs/{job_id}`;
 *   - `kolektr/extract`, `fetchyr/authenticate`, `fetchyr/form/detect`,
 *     `fetchyr/form/fill`, `fetchyr/mfa/detect`, `nexus/analyze`,
 *     `nexus/synthesize` and `nexus/execute` poll
 *     `…/handoff/{job_id}`.
 *
 * Either poll answers `{status, result?, error?}`: `completed` carries the
 * route's own 200 body as `result`, `failed` carries `error`, anything else
 * (`running`, `pending`) is still going. A 404 means the job is unknown or
 * its result has expired (the API keeps it for an hour).
 */

import type { HttpTransport } from './_http.js';
import { ApiError, JobFailedError, JobTimeoutError } from './errors.js';

/** How a call follows a 202 hand-off. */
export interface HandoffOptions {
  /** First wait between polls; each later wait is 1.5 times longer, at most 15 s. Default 3000 ms. */
  pollIntervalMs?: number | undefined;
  /** How long to follow the job before throwing JobTimeoutError. Default 15 minutes. */
  pollTimeoutMs?: number | undefined;
}

export const DEFAULT_POLL_INTERVAL_MS = 3000;
export const DEFAULT_POLL_TIMEOUT_MS = 15 * 60 * 1000;
export const POLL_BACKOFF = 1.5;
export const MAX_POLL_INTERVAL_MS = 15_000;

/** The 202 body: the work continues as a job. */
export interface HandedOff {
  job_id: string;
  poll_url: string;
}

export function isHandedOff(raw: unknown): raw is Record<string, unknown> & HandedOff {
  return (
    raw !== null &&
    typeof raw === 'object' &&
    typeof (raw as Record<string, unknown>)['job_id'] === 'string' &&
    typeof (raw as Record<string, unknown>)['poll_url'] === 'string'
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Poll a job until it completes (its result), fails (JobFailedError), is
 * gone (404: JobFailedError) or the timeout passes (JobTimeoutError).
 */
export async function followJob(
  jobId: string,
  poll: () => Promise<Record<string, unknown>>,
  opts: HandoffOptions = {},
): Promise<Record<string, unknown>> {
  let interval = Math.max(0, opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const deadline = Date.now() + (opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS);
  for (;;) {
    let job: Record<string, unknown>;
    try {
      job = await poll();
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 404) {
        throw new JobFailedError(`Job ${jobId} not found or expired: ${err.message}`, jobId);
      }
      throw err;
    }
    const status = String(job['status'] ?? '');
    if (status === 'completed') return (job['result'] as Record<string, unknown> | undefined) ?? {};
    if (status === 'failed') throw new JobFailedError(String(job['error'] ?? 'Job failed'), jobId);
    if (Date.now() + interval > deadline) {
      throw new JobTimeoutError(`Job ${jobId} still running; resume waiting with its id`, jobId);
    }
    await sleep(interval);
    interval = Math.min(interval * POLL_BACKOFF, MAX_POLL_INTERVAL_MS);
  }
}

/**
 * POST to a route that may hand off (202). Returns the route's 200 body:
 * directly, or once the handed-off job completes.
 */
export async function postFollowingHandoff(
  t: HttpTransport,
  path: string,
  body: Record<string, unknown>,
  opts: HandoffOptions = {},
): Promise<Record<string, unknown>> {
  const { status, body: raw } = await t.postWithStatus(path, body);
  if (status !== 202 || !isHandedOff(raw)) return raw;
  return followJob(raw.job_id, () => t.getAbsolute(raw.poll_url), opts);
}

/** The state of a handed-off job (`GET handoff/{job_id}`): `{status, result?, error?}`. */
export async function getHandoff(t: HttpTransport, jobId: string): Promise<Record<string, unknown>> {
  return t.get(`handoff/${encodeURIComponent(jobId)}`);
}

/** Poll a handed-off job until it completes (its result), fails or the wait runs out. */
export async function waitForHandoff(
  t: HttpTransport,
  jobId: string,
  opts: HandoffOptions = {},
): Promise<Record<string, unknown>> {
  return followJob(jobId, () => getHandoff(t, jobId), opts);
}
