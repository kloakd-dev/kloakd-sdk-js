/**
 * KLOAKD SDK — streamed downloads (the crawl-extract and batch exports).
 *
 * The export routes stream their rows as a file (JSON, NDJSON or CSV); the
 * SDK hands the body on as a stream, or writes it to a file, without holding
 * it in memory.
 */

import type { HttpTransport } from './_http.js';
import { KloakdError } from './errors.js';
import type { ExportDownload, ExportFormat, SavedExport } from './models.js';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['json', 'ndjson', 'csv'];

export function checkExportFormat(format: string | undefined): ExportFormat {
  const value = format ?? 'json';
  if (!(EXPORT_FORMATS as readonly string[]).includes(value)) {
    throw new RangeError(`Kloakd: format must be one of ${EXPORT_FORMATS.join(', ')}, got ${value}`);
  }
  return value as ExportFormat;
}

function filenameOf(disposition: string | null): string | null {
  const match = /filename="?([^";]+)"?/.exec(disposition ?? '');
  return match ? match[1]! : null;
}

/** GET an export route and return its body as a stream, with what its headers say. */
export async function openExport(
  t: HttpTransport,
  path: string,
  params: Record<string, string>,
): Promise<ExportDownload> {
  const resp = await t.getStream(path, params);
  if (!resp.body) throw new KloakdError('The export answered without a body', resp.status);
  return {
    body: resp.body,
    contentType: resp.headers.get('content-type'),
    filename: filenameOf(resp.headers.get('content-disposition')),
    jobStatus: resp.headers.get('x-job-status'),
  };
}

/**
 * GET an export route and write its body to `filePath` as it arrives
 * (Node.js only). The file is created once the API has answered 200, so a
 * refused request leaves no file; a download that breaks part way throws
 * and leaves the part written.
 */
export async function saveExport(
  t: HttpTransport,
  path: string,
  params: Record<string, string>,
  filePath: string,
): Promise<SavedExport> {
  const download = await openExport(t, path, params);
  const { open } = await import('node:fs/promises');
  const file = await open(filePath, 'w');
  let bytes = 0;
  const reader = download.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      bytes += value.byteLength;
    }
  } finally {
    reader.releaseLock();
    await file.close();
  }
  return { path: filePath, bytes, contentType: download.contentType, filename: download.filename, jobStatus: download.jobStatus };
}
