import { makeClient, mockFetch, parseCallBody } from './helpers.js';

const SESSION_RESPONSE = {
  success: true,
  session_id: 'sess-001',
  url: 'https://example.com/login',
  artifact_id: 'art-sess-001',
  screenshot_url: null,
  error: null,
};

describe('fetchyr.login', () => {
  it('returns SessionResult', async () => {
    const client = makeClient(mockFetch(SESSION_RESPONSE));
    const result = await client.fetchyr.login(
      'https://example.com/login',
      '#email', '#password', 'user@example.com', 's3cr3t',
    );
    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('sess-001');
    expect(result.artifactId).toBe('art-sess-001');
    expect(result.ok).toBe(true);
  });

  it('passes optional selectors and successUrl', async () => {
    const fetch = mockFetch(SESSION_RESPONSE);
    const client = makeClient(fetch);
    await client.fetchyr.login(
      'https://example.com/login', '#email', '#password', 'u', 'p',
      { submitSelector: '#submit', successUrlContains: '/dashboard' },
    );
    const body = parseCallBody((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!);
    expect(body['submit_selector']).toBe('#submit');
    expect(body['success_url_contains']).toBe('/dashboard');
  });
});

describe('fetchyr.fetch', () => {
  it('returns FetchyrResult', async () => {
    const client = makeClient(mockFetch({
      success: true,
      url: 'https://example.com/dashboard',
      status_code: 200,
      html: '<html>dashboard</html>',
      artifact_id: 'art-fetch-001',
      error: null,
    }));
    const result = await client.fetchyr.fetch('https://example.com/dashboard', 'art-sess-001');
    expect(result.success).toBe(true);
    expect(result.sessionArtifactId).toBe('art-sess-001');
    expect(result.html).toBe('<html>dashboard</html>');
    expect(result.ok).toBe(true);
  });
});

describe('fetchyr.createWorkflow', () => {
  it('returns WorkflowResult', async () => {
    const client = makeClient(mockFetch({
      workflow_id: 'wf-001',
      name: 'Login and Scrape',
      steps: [],
      url: 'https://example.com',
      created_at: '2026-01-01T00:00:00Z',
      error: null,
    }));
    const result = await client.fetchyr.createWorkflow('Login and Scrape', [], 'https://example.com');
    expect(result.workflowId).toBe('wf-001');
    expect(result.name).toBe('Login and Scrape');
    expect(result.ok).toBe(true);
  });
});

describe('fetchyr.executeWorkflow', () => {
  it('returns WorkflowExecutionResult', async () => {
    const client = makeClient(mockFetch({
      execution_id: 'exec-001',
      workflow_id: 'wf-001',
      status: 'completed',
      started_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-01T00:00:05Z',
      records: [{ title: 'Item A' }],
      error: null,
    }));
    const result = await client.fetchyr.executeWorkflow('wf-001');
    expect(result.executionId).toBe('exec-001');
    expect(result.status).toBe('completed');
    expect(result.records).toHaveLength(1);
    expect(result.ok).toBe(true);
  });
});

describe('fetchyr.detectForms', () => {
  it('returns FormDetectionResult', async () => {
    const client = makeClient(mockFetch({
      forms: [{ selector: '#login-form', fields: ['email', 'password'], action: '/login', method: 'POST', confidence: 0.99 }],
      total_forms: 1,
      error: null,
    }));
    const result = await client.fetchyr.detectForms('https://example.com/login');
    expect(result.forms).toHaveLength(1);
    expect(result.totalForms).toBe(1);
    expect(result.error).toBeNull();
  });
});

describe('fetchyr.detectMfa', () => {
  it('returns MfaDetectionResult', async () => {
    const client = makeClient(mockFetch({
      mfa_detected: true,
      challenge_id: 'chal-001',
      mfa_type: 'totp',
      error: null,
    }));
    const result = await client.fetchyr.detectMfa('https://example.com/login', { sessionArtifactId: 'sess-001' });
    expect(result.mfaDetected).toBe(true);
    expect(result.challengeId).toBe('chal-001');
    expect(result.mfaType).toBe('totp');
  });
});

describe('fetchyr.submitMfa', () => {
  it('returns MfaResult', async () => {
    const client = makeClient(mockFetch({
      success: true,
      session_artifact_id: 'art-sess-002',
      error: null,
    }));
    const result = await client.fetchyr.submitMfa('chal-001', '123456');
    expect(result.success).toBe(true);
    expect(result.sessionArtifactId).toBe('art-sess-002');
  });
});

describe('fetchyr.checkDuplicates', () => {
  it('returns DeduplicationResult', async () => {
    const client = makeClient(mockFetch({
      unique_records: [{ id: 1 }],
      duplicate_count: 2,
      total_input: 3,
      error: null,
    }));
    const records = [{ id: 1 }, { id: 1 }, { id: 2 }];
    const result = await client.fetchyr.checkDuplicates(records);
    expect(result.uniqueRecords).toHaveLength(1);
    expect(result.duplicateCount).toBe(2);
    expect(result.totalInput).toBe(3);
    expect(result.ok).toBe(true);
  });
});
