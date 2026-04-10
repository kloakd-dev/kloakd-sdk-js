import {
  ApiError,
  AuthenticationError,
  KloakdError,
  NotEntitledError,
  RateLimitError,
  UpstreamError,
} from '../src/errors.js';
import { raiseForStatus } from '../src/errors.js';

describe('Error hierarchy', () => {
  it('KloakdError is base class for all SDK errors', () => {
    expect(new AuthenticationError('x')).toBeInstanceOf(KloakdError);
    expect(new NotEntitledError('x', 'evadr')).toBeInstanceOf(KloakdError);
    expect(new RateLimitError('x', 60)).toBeInstanceOf(KloakdError);
    expect(new UpstreamError('x')).toBeInstanceOf(KloakdError);
    expect(new ApiError('x', 500)).toBeInstanceOf(KloakdError);
  });

  it('AuthenticationError has statusCode 401', () => {
    const e = new AuthenticationError('bad key');
    expect(e.statusCode).toBe(401);
    expect(e.message).toBe('bad key');
    expect(e.name).toBe('AuthenticationError');
  });

  it('NotEntitledError carries module and upgradeUrl', () => {
    const e = new NotEntitledError('no access', 'nexus', 'https://billing.example.com');
    expect(e.statusCode).toBe(403);
    expect(e.module).toBe('nexus');
    expect(e.upgradeUrl).toBe('https://billing.example.com');
    expect(e.name).toBe('NotEntitledError');
  });

  it('NotEntitledError defaults upgradeUrl', () => {
    const e = new NotEntitledError('no access', 'evadr');
    expect(e.upgradeUrl).toBe('https://app.kloakd.dev/billing');
  });

  it('RateLimitError carries retryAfter and resetAt', () => {
    const e = new RateLimitError('slow down', 30, '2026-01-01T00:00:00Z');
    expect(e.statusCode).toBe(429);
    expect(e.retryAfter).toBe(30);
    expect(e.resetAt).toBe('2026-01-01T00:00:00Z');
    expect(e.name).toBe('RateLimitError');
  });

  it('UpstreamError has statusCode 502', () => {
    const e = new UpstreamError('site down');
    expect(e.statusCode).toBe(502);
    expect(e.name).toBe('UpstreamError');
  });

  it('ApiError preserves arbitrary status codes', () => {
    const e = new ApiError('server error', 503);
    expect(e.statusCode).toBe(503);
    expect(e.name).toBe('ApiError');
  });
});

describe('raiseForStatus', () => {
  it('does nothing for 2xx', () => {
    expect(() => raiseForStatus(200, {})).not.toThrow();
    expect(() => raiseForStatus(201, {})).not.toThrow();
  });

  it('throws AuthenticationError for 401', () => {
    expect(() => raiseForStatus(401, { detail: 'bad key' })).toThrow(AuthenticationError);
  });

  it('throws NotEntitledError for 403', () => {
    expect(() => raiseForStatus(403, { detail: 'no plan', module: 'nexus' })).toThrow(NotEntitledError);
  });

  it('throws RateLimitError for 429', () => {
    expect(() => raiseForStatus(429, { detail: 'quota', retry_after: 45 })).toThrow(RateLimitError);
    try {
      raiseForStatus(429, { detail: 'quota', retry_after: 45 });
    } catch (e) {
      expect((e as RateLimitError).retryAfter).toBe(45);
    }
  });

  it('throws UpstreamError for 502', () => {
    expect(() => raiseForStatus(502, { detail: 'site down' })).toThrow(UpstreamError);
  });

  it('throws ApiError for other 4xx/5xx', () => {
    expect(() => raiseForStatus(503, {})).toThrow(ApiError);
    expect(() => raiseForStatus(400, { detail: 'bad request' })).toThrow(ApiError);
  });

  it('uses fallback message when body is empty', () => {
    try {
      raiseForStatus(401, {});
    } catch (e) {
      expect((e as KloakdError).message).toContain('HTTP 401');
    }
  });
});
