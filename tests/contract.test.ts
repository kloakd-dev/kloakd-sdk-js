/**
 * Every request the SDK makes is a live API route (method and path).
 *
 * tests/fixtures/routes.tsv is the backend's route list (METHOD\tPATH,
 * generated from kobe-scraper 4fb33ea4 with the module routers mounted as
 * kernel/bootstrap.py does; for 0.4.0 the nexus/recommendations routes, the
 * unmounted standalone recommendations router, POST kolektr/jobs and the
 * other routes kobe-scraper d7d25134 deleted are removed, and the hand-off
 * poll GET handoff/{job_id} is added). Each public
 * method of each namespace is called with placeholder arguments against a
 * recording fetch.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { makeClient, ORG_PREFIX, TEST_BASE_URL } from './helpers.js';

declare const jest: { fn: (impl?: (...args: unknown[]) => unknown) => { mock: { calls: unknown[][] } } };

const routes = readFileSync(join(__dirname, 'fixtures', 'routes.tsv'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => {
    const [method, path] = line.split('\t') as [string, string];
    const pattern = path
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
      .replace(/\{[a-z_]+:path\}/g, '.+')
      .replace(/\{[a-z_]+\}/g, '[^/]+');
    return { method, path, re: new RegExp(`^${pattern}$`) };
  });

function isLive(method: string, path: string): boolean {
  return routes.some((r) => r.method === method && r.re.test(path));
}

const GENERIC = {
  status: 'completed',
  crawl_id: 'c-1',
  job_id: 'j-1',
  nodes: [],
  next_cursor: null,
  result: {},
  success: true,
};

function recordingFetch() {
  return jest.fn(async () => ({
    status: 200,
    ok: true,
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
    json: async () => GENERIC,
    body: undefined,
  }));
}

async function callEverything(): Promise<Array<{ method: string; path: string; caller: string }>> {
  const fetch = recordingFetch();
  const client = makeClient(fetch);
  const seen: Array<{ method: string; path: string; caller: string }> = [];
  const namespaces = ['evadr', 'webgrph', 'skanyr', 'nexus', 'parlyr', 'fetchyr', 'kolektr'] as const;
  for (const ns of namespaces) {
    const target = (client as unknown as Record<string, Record<string, unknown>>)[ns]!;
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(target)).filter(
      (n) => n !== 'constructor' && typeof target[n] === 'function',
    );
    for (const name of names) {
      const before = fetch.mock.calls.length;
      try {
        const out = (target[name] as (...a: unknown[]) => unknown).call(target, 'id-1', 'id-2', 'id-3');
        if (out && typeof (out as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
          for await (const _ of out as AsyncIterable<unknown>) { void _; }
        } else {
          await out;
        }
      } catch {
        // placeholder arguments may not satisfy a method; the request it sent is what is checked
      }
      for (const call of fetch.mock.calls.slice(before)) {
        const url = new URL(String(call[0]));
        const init = (call[1] ?? {}) as { method?: string };
        seen.push({ method: init.method ?? 'GET', path: url.pathname, caller: `${ns}.${name}` });
      }
    }
  }
  return seen;
}

describe('the SDK calls only live routes', () => {
  it('every request matches a route in the API', async () => {
    const calls = await callEverything();
    expect(calls.length).toBeGreaterThan(80);
    const dead = calls.filter((c) => !isLive(c.method, c.path)).map((c) => `${c.caller}: ${c.method} ${c.path}`);
    expect(dead).toEqual([]);
  });

  it('every request is under the organisation prefix of the configured host', async () => {
    const calls = await callEverything();
    expect(calls.every((c) => c.path.startsWith(ORG_PREFIX))).toBe(true);
    expect(TEST_BASE_URL).toBe('https://api.kloakd.dev');
  });
});

/** The routes that answer 202 after the synchronous limit, and the method that calls each. */
const HANDOFF_CALLS: Array<{ caller: string; route: string; poll: string; call: (c: ReturnType<typeof makeClient>) => Promise<unknown> }> = [
  { caller: 'evadr.fetch', route: 'evadr/fetch', poll: 'evadr/jobs/h-1', call: (c) => c.evadr.fetch('u', { pollIntervalMs: 1 }) },
  { caller: 'kolektr.page', route: 'kolektr/extract', poll: 'handoff/h-1', call: (c) => c.kolektr.page('u', { pollIntervalMs: 1 }) },
  { caller: 'fetchyr.authenticate', route: 'fetchyr/authenticate', poll: 'handoff/h-1', call: (c) => c.fetchyr.authenticate('n', 'u', { pollIntervalMs: 1 }) },
  { caller: 'fetchyr.detectForms', route: 'fetchyr/form/detect', poll: 'handoff/h-1', call: (c) => c.fetchyr.detectForms('u', { pollIntervalMs: 1 }) },
  { caller: 'fetchyr.fillForm', route: 'fetchyr/form/fill', poll: 'handoff/h-1', call: (c) => c.fetchyr.fillForm('u', {}, { pollIntervalMs: 1 }) },
  { caller: 'fetchyr.detectMfa', route: 'fetchyr/mfa/detect', poll: 'handoff/h-1', call: (c) => c.fetchyr.detectMfa('u', { pollIntervalMs: 1 }) },
  { caller: 'nexus.analyze', route: 'nexus/analyze', poll: 'handoff/h-1', call: (c) => c.nexus.analyze('u', '<html/>', { pollIntervalMs: 1 }) },
  { caller: 'nexus.synthesize', route: 'nexus/synthesize', poll: 'handoff/h-1', call: (c) => c.nexus.synthesize('u', '<html/>', 'g', { pollIntervalMs: 1 }) },
  { caller: 'nexus.execute', route: 'nexus/execute', poll: 'handoff/h-1', call: (c) => c.nexus.execute('s', 'u', { pollIntervalMs: 1 }) },
];

describe('every route that can hand off is followed through a live poll route', () => {
  it.each(HANDOFF_CALLS)('$caller follows a 202 from $route', async ({ route, poll, call }) => {
    const answers = [
      { status: 202, body: { job_id: 'h-1', status: 'running', reason: 'sync_limit_reached', waited_seconds: 85, poll_url: `${ORG_PREFIX}/${poll}`, message: '' } },
      { status: 200, body: { job_id: 'h-1', status: 'running' } },
      { status: 200, body: { job_id: 'h-1', status: 'completed', result: { success: true, marker: 'from-job' } } },
    ];
    const fetch = jest.fn(async () => {
      const a = answers.shift()!;
      return { status: a.status, ok: true, headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) }, json: async () => a.body, body: undefined };
    });
    const out = (await call(makeClient(fetch))) as Record<string, unknown>;
    const seen = fetch.mock.calls.map((c) => ({
      method: ((c[1] ?? {}) as { method?: string }).method ?? 'GET',
      path: new URL(String(c[0])).pathname,
    }));
    expect(seen).toEqual([
      { method: 'POST', path: `${ORG_PREFIX}/${route}` },
      { method: 'GET', path: `${ORG_PREFIX}/${poll}` },
      { method: 'GET', path: `${ORG_PREFIX}/${poll}` },
    ]);
    expect(seen.every((c) => isLive(c.method, c.path))).toBe(true);
    expect(out).toBeTruthy(); // resolved with the parsed result; parsing is checked in handoff.test.ts
  });

  it('covers every route the API decorates with @hands_off_after_limit, and evadr/fetch', () => {
    expect(HANDOFF_CALLS.map((h) => h.route).sort()).toEqual([
      'evadr/fetch',
      'fetchyr/authenticate',
      'fetchyr/form/detect',
      'fetchyr/form/fill',
      'fetchyr/mfa/detect',
      'kolektr/extract',
      'nexus/analyze',
      'nexus/execute',
      'nexus/synthesize',
    ]);
  });

  it('the removed routes are not in the route list', () => {
    expect(routes.some((r) => r.path.includes('/recommendations/'))).toBe(false);
    const removed: Array<[string, string]> = [
      ['POST', 'kolektr/jobs'],
      ['GET', 'kolektr/jobs/j-1/progress'],
      ['GET', 'kolektr/jobs/j-1/progress/summary'],
      ['GET', 'kolektr/jobs/j-1/progress/events'],
      ['GET', 'kolektr/jobs/j-1/progress/latest'],
      ['GET', 'kolektr/progress/phases'],
      ['GET', 'kolektr/progress/phases/p'],
      ['GET', 'kolektr/progress/phases/p/steps'],
      ['GET', 'kolektr/progress/summary'],
      ['GET', 'kolektr/pipeline/p-1/stream'],
      ['GET', 'kolektr/pipeline/p-1/events'],
      ['GET', 'webgrph/analytics/job-trends'],
      ['GET', 'webgrph/analytics/error-summary'],
      ['GET', 'evadr/profiles'],
    ];
    expect(removed.filter(([m, p]) => isLive(m, `${ORG_PREFIX}/${p}`))).toEqual([]);
    expect(isLive('GET', `${ORG_PREFIX}/kolektr/jobs`)).toBe(true);
    expect(isLive('GET', `${ORG_PREFIX}/kolektr/jobs/j-1`)).toBe(true);
    expect(isLive('GET', `${ORG_PREFIX}/evadr/vendors`)).toBe(true);
  });

  it('the SDK does not call the dashboard-only webgrph analytics routes', async () => {
    const calls = await callEverything();
    expect(calls.filter((c) => c.path.includes('/webgrph/analytics/'))).toEqual([]);
  });
});
