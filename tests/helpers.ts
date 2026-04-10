/**
 * Test helpers — builds a Kloakd client with a mock fetch implementation.
 * jest global is available in the Jest test environment without importing.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Kloakd } from '../src/client.js';

declare const jest: { fn: () => any };

export const TEST_API_KEY = 'sk-test-fixture-key';
export const TEST_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_BASE_URL = 'https://api.kloakd.dev';
export const ORG_PREFIX = `/api/v1/organizations/${TEST_ORG_ID}`;

type MockFn = any;

/** Build a mock fetch that returns a JSON response once. */
export function mockFetch(
  body: Record<string, unknown>,
  status = 200,
): MockFn {
  return jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(body),
  });
}

/** Build a mock fetch that returns a sequence of responses. */
export function mockFetchSequence(
  responses: Array<{ body: Record<string, unknown>; status?: number }>,
): MockFn {
  const mock = jest.fn();
  responses.forEach(({ body, status = 200 }) => {
    mock.mockResolvedValueOnce({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (h: string) => (h === 'content-type' ? 'application/json' : null) },
      json: () => Promise.resolve(body),
    });
  });
  return mock;
}

/** Build a mock fetch that returns an error response. */
export function mockFetchError(
  detail: string,
  status: number,
  extra: Record<string, unknown> = {},
): MockFn {
  return mockFetch({ detail, ...extra }, status);
}

/** Build an SSE stream body from an array of data payloads. */
export function sseBody(payloads: Record<string, unknown>[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = payloads.flatMap((p) => [`data: ${JSON.stringify(p)}`, '']).join('\n');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

/** Build an SSE stream with event: + data: pairs. */
export function sseEventBody(
  pairs: Array<{ event: string; data: Record<string, unknown> }>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = pairs.flatMap(({ event, data }) => [`event: ${event}`, `data: ${JSON.stringify(data)}`, '']).join('\n');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

/** Build a mock fetch for SSE responses. */
export function mockSseFetch(
  payloads: Record<string, unknown>[],
  status = 200,
): MockFn {
  return jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    body: sseBody(payloads),
  });
}

/** Build a mock fetch for named SSE event responses. */
export function mockSseEventFetch(
  pairs: Array<{ event: string; data: Record<string, unknown> }>,
  status = 200,
): MockFn {
  return jest.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    body: sseEventBody(pairs),
  });
}

/** Extract and JSON-parse the request body from a captured fetch call. */
export function parseCallBody(mockCallArgs: unknown[]): Record<string, unknown> {
  const init = mockCallArgs[1] as { body?: string };
  return JSON.parse(init.body ?? '{}') as Record<string, unknown>;
}

/** Extract the URL from a captured fetch call. */
export function callUrl(mockCallArgs: unknown[]): string {
  return mockCallArgs[0] as string;
}

export function makeClient(fetchImpl: MockFn): Kloakd {
  return new Kloakd({
    apiKey: TEST_API_KEY,
    organizationId: TEST_ORG_ID,
    baseUrl: TEST_BASE_URL,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}
