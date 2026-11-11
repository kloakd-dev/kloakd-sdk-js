/**
 * The changes after 0.6.0 (unreleased), each checked against kobe-scraper integration/2026-11-12
 * (e5e358aa): the crawl-extract job (modules/webgrph/crawl_extract_router.py),
 * the batch export (kernel/batch_export_router.py) and the streamed downloads.
 */
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ApiError, JobFailedError, JobTimeoutError, NotEntitledError, ForbiddenError } from '../src/errors.js';
import { CRAWL_EXTRACT_MAX_LIMIT } from '../src/index.js';
import { makeClient, mockFetch, mockFetchSequence, ORG_PREFIX, TEST_BASE_URL } from './helpers.js';

type Call = [string, RequestInit];
const calls = (f: jest.Mock) => f.mock.calls as unknown as Call[];
const urlOf = (f: jest.Mock, i = 0): URL => new URL(calls(f)[i]![0]);
const bodyOf = (f: jest.Mock, i = 0): Record<string, unknown> =>
  JSON.parse(String(calls(f)[i]![1].body ?? '{}')) as Record<string, unknown>;

const JOB = 'b7a1c0de-0000-4000-8000-000000000001';
const BASE = `${ORG_PREFIX}/webgrph/crawl-extract/${JOB}`;
const LINKS = {
  status: BASE,
  results: `${BASE}/results`,
  pages: `${BASE}/pages`,
  cancel: `${BASE}/cancel`,
  export: { json: `${BASE}/export?format=json`, ndjson: `${BASE}/export?format=ndjson`, csv: `${BASE}/export?format=csv` },
  crawl_events: `${ORG_PREFIX}/webgrph/crawl/c-1/events`,
  events: `${ORG_PREFIX}/pipeline/${JOB}/stream`,
};
const STATUS = {
  job_id: JOB, crawl_id: 'c-1', url: 'https://shop.example/', status: 'extracting', cancel_requested: false,
  progress: { pages_crawled: 12, pages_total: 12, pages_extracted: 5, pages_failed: 1, items: 40 },
  error: null, error_code: null, request: { crawl: { max_pages: 50 }, extract: { fields: ['title'] } },
  created_at: '2026-11-12T10:00:00+00:00', started_at: '2026-11-12T10:00:01+00:00', completed_at: null,
  updated_at: '2026-11-12T10:01:00+00:00', links: LINKS,
  pages_by_method: { engine: 4, failed: 1 },
  shapes: [{ shape: 'ab12', kind: 'item', rows: 40, page_types: ['listing'], fields: ['price', 'title'] }],
};
const ROW = (i: number) => ({ page_url: 'https://shop.example/p', page_type: 'listing', row_kind: 'item', item_index: i, data: { title: `t${i}` }, shape: 'ab12' });

/** A fetch that answers with a streamed body, in chunks. */
function streamFetch(chunks: string[], headers: Record<string, string> = {}, status = 200): jest.Mock {
  return jest.fn(async () => ({
    status,
    ok: status < 300,
    headers: { get: (h: string) => headers[h.toLowerCase()] ?? null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    }),
  }));
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    text += decoder.decode(value, { stream: true });
  }
}

describe('webgrph.startCrawlExtract (POST webgrph/crawl-extract, CrawlExtractRequest)', () => {
  it('sends the crawl options and extract.schema, and reads the 202', async () => {
    const fetch = mockFetch({ success: true, job_id: JOB, crawl_id: 'c-1', url: 'https://shop.example/', status: 'queued', limits: { max_pages: 50, max_depth: 3 }, links: LINKS }, 202);
    const job = await makeClient(fetch).webgrph.startCrawlExtract('https://shop.example/', {
      maxPages: 50,
      maxDepth: 3,
      scope: { same_host: true },
      extract: {
        entityType: 'products',
        fields: ['title', 'price'],
        schema: { itemSelector: 'li.product', fields: [{ name: 'title', selector: 'h3' }, { name: 'link', selector: 'a', attribute: 'href' }] },
      },
    });
    expect(calls(fetch)[0]![1].method).toBe('POST');
    expect(urlOf(fetch).pathname).toBe(`${ORG_PREFIX}/webgrph/crawl-extract`);
    expect(bodyOf(fetch)).toEqual({
      url: 'https://shop.example/',
      max_pages: 50,
      max_depth: 3,
      scope: { same_host: true },
      extract: {
        entity_type: 'products',
        fields: ['title', 'price'],
        schema: { item_selector: 'li.product', fields: [{ name: 'title', selector: 'h3' }, { name: 'link', selector: 'a', attribute: 'href' }] },
      },
    });
    expect([job.jobId, job.crawlId, job.status, job.limits]).toEqual([JOB, 'c-1', 'queued', { maxPages: 50, maxDepth: 3 }]);
    expect(job.links?.export['csv']).toBe(`${BASE}/export?format=csv`);
    expect(job.links?.crawlEvents).toBe(`${ORG_PREFIX}/webgrph/crawl/c-1/events`);
  });

  it('sends only the url when no option is set (the API applies the tier limits)', async () => {
    const fetch = mockFetch({ job_id: JOB, crawl_id: 'c-1', status: 'queued' }, 202);
    await makeClient(fetch).webgrph.startCrawlExtract('https://shop.example/');
    expect(bodyOf(fetch)).toEqual({ url: 'https://shop.example/' });
  });

  it('a plan without Kolektr is NotEntitledError or ForbiddenError, as the API codes it', async () => {
    const fetch = mockFetch({ detail: { error: 'module_not_entitled', module: 'kolektr', message: 'needs Kolektr' } }, 403);
    const err = await makeClient(fetch).webgrph.startCrawlExtract('https://shop.example/').catch((e) => e);
    expect(err instanceof NotEntitledError || err instanceof ForbiddenError).toBe(true);
    expect(err.statusCode).toBe(403);
  });
});

describe('webgrph.getCrawlExtract and waiting', () => {
  it('reads the stage, counters, links, methods and shapes', async () => {
    const fetch = mockFetch(STATUS);
    const s = await makeClient(fetch).webgrph.getCrawlExtract(JOB);
    expect(urlOf(fetch).pathname).toBe(BASE);
    expect(s.progress).toEqual({ pagesCrawled: 12, pagesTotal: 12, pagesExtracted: 5, pagesFailed: 1, items: 40 });
    expect([s.status, s.finished, s.ok, s.cancelRequested, s.completedAt, s.createdAt]).toEqual(['extracting', false, false, false, null, '2026-11-12T10:00:00+00:00']);
    expect(s.pagesByMethod).toEqual({ engine: 4, failed: 1 });
    expect(s.shapes).toEqual([{ shape: 'ab12', kind: 'item', rows: 40, pageTypes: ['listing'], fields: ['price', 'title'] }]);
    expect(s.links?.results).toBe(`${BASE}/results`);
  });

  it('waitForCrawlExtract polls until the job ends', async () => {
    const fetch = mockFetchSequence([
      { body: { ...STATUS, status: 'crawling' } },
      { body: STATUS },
      { body: { ...STATUS, status: 'completed' } },
    ]);
    const s = await makeClient(fetch).webgrph.waitForCrawlExtract(JOB, { pollIntervalMs: 1 });
    expect([s.status, s.finished, s.ok]).toEqual(['completed', true, true]);
    expect(calls(fetch)).toHaveLength(3);
  });

  it('waitForCrawlExtract throws JobTimeoutError with the job id when still running', async () => {
    const err = await makeClient(mockFetch(STATUS)).webgrph.waitForCrawlExtract(JOB, { pollIntervalMs: 5, timeoutMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobTimeoutError);
    expect(err.jobId).toBe(JOB);
  });

  it('crawlExtract starts, waits, and throws JobFailedError for a failed job', async () => {
    const ok = mockFetchSequence([
      { body: { job_id: JOB, crawl_id: 'c-1', status: 'queued' }, status: 202 },
      { body: { ...STATUS, status: 'completed' } },
    ]);
    const done = await makeClient(ok).webgrph.crawlExtract('https://shop.example/', { maxPages: 5, pollIntervalMs: 1 });
    expect(done.ok).toBe(true);
    expect(bodyOf(ok)).toEqual({ url: 'https://shop.example/', max_pages: 5 });

    const failed = mockFetchSequence([
      { body: { job_id: JOB, crawl_id: 'c-1', status: 'queued' }, status: 202 },
      { body: { ...STATUS, status: 'failed', error: 'Crawl failed: blocked', error_code: 'crawl_failed' } },
    ]);
    const err = await makeClient(failed).webgrph.crawlExtract('https://shop.example/', { pollIntervalMs: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(JobFailedError);
    expect([err.jobId, err.message]).toEqual([JOB, 'Crawl failed: blocked']);
  });

  it('a cancelled job is returned, not thrown', async () => {
    const fetch = mockFetchSequence([
      { body: { job_id: JOB, crawl_id: 'c-1', status: 'queued' }, status: 202 },
      { body: { ...STATUS, status: 'cancelled', error: 'Cancelled by user' } },
    ]);
    const s = await makeClient(fetch).webgrph.crawlExtract('https://shop.example/', { pollIntervalMs: 1 });
    expect([s.status, s.finished, s.ok]).toEqual(['cancelled', true, false]);
  });
});

describe('webgrph crawl-extract results and pages', () => {
  it('getCrawlExtractResults sends limit, cursor and the filters, and reads the rows', async () => {
    const fetch = mockFetch({ job_id: JOB, status: 'completed', total: 3, count: 2, rows: [ROW(0), ROW(1)], next_cursor: '0:1' });
    const page = await makeClient(fetch).webgrph.getCrawlExtractResults(JOB, { limit: 2, cursor: '0:0', shape: 'ab12', pageType: 'listing', kind: 'item' });
    const url = urlOf(fetch);
    expect(url.pathname).toBe(`${BASE}/results`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '2', cursor: '0:0', shape: 'ab12', page_type: 'listing', kind: 'item' });
    expect([page.total, page.count, page.nextCursor, page.status]).toEqual([3, 2, '0:1', 'completed']);
    expect(page.rows[1]).toEqual({ pageUrl: 'https://shop.example/p', pageType: 'listing', rowKind: 'item', itemIndex: 1, data: { title: 't1' }, shape: 'ab12' });
  });

  it('sends no query when nothing is set (the API defaults to 100 rows)', async () => {
    const fetch = mockFetch({ job_id: JOB, status: 'completed', total: 0, count: 0, rows: [], next_cursor: null });
    await makeClient(fetch).webgrph.getCrawlExtractResults(JOB);
    expect(urlOf(fetch).search).toBe('');
  });

  it('crawlExtractAllResults and iterCrawlExtractResults follow next_cursor to the last page', async () => {
    const pages = [
      { body: { job_id: JOB, status: 'completed', total: 3, count: 2, rows: [ROW(0), ROW(1)], next_cursor: '0:1' } },
      { body: { job_id: JOB, status: 'completed', total: 3, count: 1, rows: [ROW(2)], next_cursor: null } },
    ];
    const fetch = mockFetchSequence(pages);
    const rows = await makeClient(fetch).webgrph.crawlExtractAllResults(JOB, { limit: 2, kind: 'item' });
    expect(rows.map((r) => r.itemIndex)).toEqual([0, 1, 2]);
    expect(Object.fromEntries(urlOf(fetch, 0).searchParams)).toEqual({ limit: '2', kind: 'item' });
    expect(Object.fromEntries(urlOf(fetch, 1).searchParams)).toEqual({ limit: '2', kind: 'item', cursor: '0:1' });

    const again = mockFetchSequence(pages);
    const seen: number[] = [];
    for await (const row of makeClient(again).webgrph.iterCrawlExtractResults(JOB)) seen.push(row.itemIndex);
    expect(seen).toEqual([0, 1, 2]);
  });

  it('a limit outside 1–1000 throws before sending', async () => {
    const fetch = mockFetch({});
    const webgrph = makeClient(fetch).webgrph;
    await expect(webgrph.getCrawlExtractResults(JOB, { limit: CRAWL_EXTRACT_MAX_LIMIT + 1 })).rejects.toThrow(RangeError);
    await expect(webgrph.getCrawlExtractPages(JOB, { limit: 0 })).rejects.toThrow(RangeError);
    expect(calls(fetch)).toHaveLength(0);
  });

  it('getCrawlExtractPages sends limit, offset and status, and reads the pages', async () => {
    const fetch = mockFetch({
      job_id: JOB, status: 'completed', count: 1, offset: 10,
      pages: [{ page_seq: 10, page_url: 'https://shop.example/x', page_type: 'detail', title: 'X', status: 'failed', method: null, item_count: 0, detail: { error: 'timeout' }, extracted_at: '2026-11-12T10:02:00+00:00' }],
    });
    const out = await makeClient(fetch).webgrph.getCrawlExtractPages(JOB, { limit: 50, offset: 10, status: 'failed' });
    const url = urlOf(fetch);
    expect(url.pathname).toBe(`${BASE}/pages`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '50', offset: '10', status: 'failed' });
    expect([out.count, out.offset]).toEqual([1, 10]);
    expect(out.pages[0]).toEqual({ pageSeq: 10, pageUrl: 'https://shop.example/x', pageType: 'detail', title: 'X', status: 'failed', method: null, itemCount: 0, detail: { error: 'timeout' }, extractedAt: '2026-11-12T10:02:00+00:00' });
  });
});

describe('webgrph crawl-extract export and cancel', () => {
  const HEADERS = {
    'content-type': 'application/x-ndjson',
    'content-disposition': `attachment; filename="crawl-extract-${JOB}.ndjson"`,
    'x-job-status': 'extracting',
  };

  it('exportCrawlExtract streams the body and reads the headers', async () => {
    const fetch = streamFetch(['{"a":1}\n', '{"a":2}\n'], HEADERS);
    const out = await makeClient(fetch).webgrph.exportCrawlExtract(JOB, { format: 'ndjson', kind: 'item', shape: 'ab12', pageType: 'listing' });
    const url = urlOf(fetch);
    expect(calls(fetch)[0]![1].method).toBe('GET');
    expect(url.pathname).toBe(`${BASE}/export`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ format: 'ndjson', shape: 'ab12', page_type: 'listing', kind: 'item' });
    expect([out.contentType, out.filename, out.jobStatus]).toEqual(['application/x-ndjson', `crawl-extract-${JOB}.ndjson`, 'extracting']);
    expect(await readAll(out.body)).toBe('{"a":1}\n{"a":2}\n');
  });

  it('the export defaults to json and is sent without the per-request timeout', async () => {
    const fetch = streamFetch(['[\n]\n']);
    await makeClient(fetch).webgrph.exportCrawlExtract(JOB);
    expect(urlOf(fetch).search).toBe('?format=json');
    expect(calls(fetch)[0]![1].signal).toBeUndefined();
    // Every other request keeps its timeout.
    const plain = mockFetch(STATUS);
    await makeClient(plain).webgrph.getCrawlExtract(JOB);
    expect(calls(plain)[0]![1].signal).toBeDefined();
  });

  it('a format the API does not have throws before sending', async () => {
    const fetch = streamFetch([]);
    await expect(makeClient(fetch).webgrph.exportCrawlExtract(JOB, { format: 'xlsx' as 'csv' })).rejects.toThrow(RangeError);
    expect(calls(fetch)).toHaveLength(0);
  });

  describe('to a file', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'kloakd-sdk-')); });
    afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

    it('downloadCrawlExtract writes the chunks to the file as they arrive', async () => {
      const csv = ['\ufeffpage_url,page_type,row_kind,item_index,title\r\n', 'https://shop.example/p,listing,item,0,"café, bar"\r\n'];
      const fetch = streamFetch(csv, { ...HEADERS, 'content-type': 'text/csv; charset=utf-8', 'x-job-status': 'completed' });
      const target = join(dir, 'rows.csv');
      const saved = await makeClient(fetch).webgrph.downloadCrawlExtract(JOB, target, { format: 'csv' });
      expect(urlOf(fetch).search).toBe('?format=csv');
      expect(readFileSync(target, 'utf8')).toBe(csv.join(''));
      expect(saved).toEqual({
        path: target,
        bytes: Buffer.byteLength(csv.join(''), 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `crawl-extract-${JOB}.ndjson`,
        jobStatus: 'completed',
      });
    });

    it('a refused download (404) throws and creates no file', async () => {
      const target = join(dir, 'none.json');
      const err = await makeClient(mockFetch({ detail: 'Crawl-extract job not found' }, 404)).webgrph.downloadCrawlExtract(JOB, target).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(404);
      expect(existsSync(target)).toBe(false);
    });

    it('client.downloadBatchJob writes the batch export to a file', async () => {
      const fetch = streamFetch(['[\n{"url":"https://e.com","job_id":"j","status":"completed","row_kind":"item","item_index":0,"data":{"a":1}}\n]\n'], {
        'content-type': 'application/json',
        'content-disposition': 'attachment; filename="batch-b-1.json"',
      });
      const target = join(dir, 'batch.json');
      const saved = await makeClient(fetch).downloadBatchJob('b-1', target);
      expect(urlOf(fetch).pathname).toBe(`${ORG_PREFIX}/batch-jobs/b-1/export`);
      expect(urlOf(fetch).search).toBe('?format=json');
      expect(JSON.parse(readFileSync(target, 'utf8'))).toHaveLength(1);
      expect([saved.filename, saved.jobStatus]).toEqual(['batch-b-1.json', null]);
    });
  });

  it('client.exportBatchJob streams GET batch-jobs/{id}/export in the format asked', async () => {
    const fetch = streamFetch(['url,job_id\r\n'], { 'content-type': 'text/csv; charset=utf-8' });
    const out = await makeClient(fetch).exportBatchJob('b 1', { format: 'csv' });
    expect(calls(fetch)[0]![0]).toBe(`${TEST_BASE_URL}${ORG_PREFIX}/batch-jobs/b%201/export?format=csv`);
    expect(await readAll(out.body)).toBe('url,job_id\r\n');
    await expect(makeClient(fetch).exportBatchJob('b-1', { format: 'zip' as 'csv' })).rejects.toThrow(RangeError);
  });

  it('cancelCrawlExtract posts to cancel and reads cancelled or cancelling', async () => {
    const fetch = mockFetch({ success: true, job_id: JOB, crawl_id: 'c-1', status: 'cancelling' });
    const out = await makeClient(fetch).webgrph.cancelCrawlExtract(JOB);
    expect(calls(fetch)[0]![1].method).toBe('POST');
    expect(urlOf(fetch).pathname).toBe(`${BASE}/cancel`);
    expect(out).toEqual({ success: true, jobId: JOB, crawlId: 'c-1', status: 'cancelling' });
  });

  it('cancelling a job that has ended is the API\'s 409 (ApiError, not a work-slot error)', async () => {
    const err = await makeClient(mockFetch({ detail: 'The job has already ended (completed)' }, 409)).webgrph.cancelCrawlExtract(JOB).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.constructor.name).toBe('ApiError');
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('The job has already ended (completed)');
  });
});
