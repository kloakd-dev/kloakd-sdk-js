/**
 * Every request the SDK makes is a live API route (method and path).
 *
 * tests/fixtures/routes.tsv is the backend's route list (METHOD\tPATH,
 * generated from kobe-scraper 4fb33ea4 with the module routers mounted as
 * kernel/bootstrap.py does). Each public method of each namespace is called
 * with placeholder arguments against a recording fetch.
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
